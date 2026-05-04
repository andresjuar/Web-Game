/**
 * liarGame.js
 * Fibbage-style social deduction game logic.
 *
 * Round flow per subject player:
 *   1. WRITING phase  — subject answers their personal question (truth).
 *                       other players write a convincing lie.
 *   2. VOTING phase   — all answers (truth + lies) shown shuffled.
 *                       everyone except the subject votes.
 *   3. REVEAL phase   — scores awarded, results shown.
 *   4. Next round or FINISHED.
 *
 * Points:
 *   - Voter picks the truth  → voter +500, subject +550
 *   - Voter picks a lie      → voter +0,   author of that lie +500
 */

const {
  sendToHost,
  sendToPlayer,
  broadcastToPlayers,
  broadcastToAll,
  getLeaderboard,
} = require("../ws/roomManager")

const { generateLiarPrompts } = require("../services/aiService");

// Timers 
const WRITING_TIME = 60; // seconds — subject + liars write their answers
const VOTING_TIME  = 30; // seconds — everyone (except subject) votes

// Points
const POINTS_VOTER_CORRECT  = 500; // voter who found the truth
const POINTS_SUBJECT_CAUGHT = 550; // subject when someone finds their truth
const POINTS_LIE_CHOSEN     = 500; // liar whose fake answer fooled a voter

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point called by wsHandler when host sends START_GAME with gameType "liar_game".
 * Generates one personal question per player via Gemini, then starts round 1.
 */
async function startLiarGame(room) {
  const playerEntries = Object.entries(room.players); // [[id, playerData], ...]
  const playerCount   = playerEntries.length;

  if (playerCount < 2) {
    sendToHost(room, "ERROR", { message: "Liar Game needs at least 2 players." });
    return;
  }

  // Transition to loading so the host UI shows the spinner
  room.state = "loading";
  broadcastToAll(room, "GAME_LOADING", { message: "Generating questions with AI..." });

  try {
    // Generate one prompt per player from Gemini
    const prompts = await generateLiarPrompts(playerCount);

    // Attach a unique prompt to each player and reset round-specific fields
    playerEntries.forEach(([id, player], index) => {
      player.liarPrompt       = prompts[index];
      player.textAnswer       = null;
      player.vote             = null;
      player.isLiar           = false; // unused flag kept for compatibility
      player.lastPoints       = 0;
    });

    // Build the round order: each player is subject exactly once
    room.liarGame = {
      subjectOrder : playerEntries.map(([id]) => id), // socketIds in order
      currentRound : -1,                              // incremented by startRound
      roundData    : null,                            // populated each round
    };

    // Kick off round 1
    startRound(room);

  } catch (err) {
    console.error("[LiarGame] Failed to generate prompts:", err.message);
    sendToHost(room, "ERROR", { message: "AI failed to generate questions. Try again." });
    room.state = "lobby";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUND LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advances to the next round (called by startLiarGame and by wsHandler NEXT_QUESTION).
 */
function nextRound(room) {
  startRound(room);
}

/**
 * Initialises and runs one full round.
 */
function startRound(room) {
  const lg = room.liarGame;
  lg.currentRound++;

  // All players have been subjects -> game over
  if (lg.currentRound >= lg.subjectOrder.length) {
    endGame(room);
    return;
  }

  const subjectId   = lg.subjectOrder[lg.currentRound];
  const subjectPlayer = room.players[subjectId];
  const roundNumber = lg.currentRound + 1;
  const totalRounds = lg.subjectOrder.length;

  // Reset per-round fields on every player
  Object.values(room.players).forEach((p) => {
    p.textAnswer  = null;
    p.vote        = null;
    p.lastPoints  = 0;
  });

  // Store round metadata
  lg.roundData = {
    subjectId,
    subjectName : subjectPlayer.name,
    question    : subjectPlayer.liarPrompt,
    answers     : {},   // socketId -> { text, isTrue }  — populated during writing
    votes       : {},   // voterSocketId → targetSocketId
    writingDone : false,
    votingDone  : false,
  };

  room.state = "liar_writing";

  // Notify host
  sendToHost(room, "LIAR_ROUND_START", {
    round        : roundNumber,
    totalRounds,
    subjectName  : subjectPlayer.name,
    question     : subjectPlayer.liarPrompt,
    writingTime  : WRITING_TIME,
    phase        : "writing",
  });

  // Notify subject
  sendToPlayer(room, subjectId, "LIAR_YOUR_TURN", {
    round       : roundNumber,
    totalRounds,
    question    : subjectPlayer.liarPrompt,
    writingTime : WRITING_TIME,
    role        : "subject",
    instruction : "Answer honestly! Others will try to copy your style.",
  });

  // Notify liars (everyone else)
  Object.keys(room.players).forEach((id) => {
    if (id === subjectId) return;
    sendToPlayer(room, id, "LIAR_YOUR_TURN", {
      round       : roundNumber,
      totalRounds,
      question    : `What is ${subjectPlayer.name}'s answer to: "${subjectPlayer.liarPrompt}"`,
      writingTime : WRITING_TIME,
      role        : "liar",
      instruction : "Write a convincing lie — fool the others!",
    });
  });

  // Writing timer 
  startWritingTimer(room);
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING PHASE
// ─────────────────────────────────────────────────────────────────────────────

function startWritingTimer(room) {
  let remaining = WRITING_TIME;

  room.timer = setInterval(() => {
    remaining--;
    broadcastToAll(room, "LIAR_TIMER", { phase: "writing", remaining });

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      transitionToVoting(room);
    }
  }, 1000);
}

/**
 * Called by wsHandler when a player sends SUBMIT_TEXT.
 */
function handleTextAnswer(room, socketId, text) {
  if (room.state !== "liar_writing") return;

  const player = room.players[socketId];
  if (!player || player.textAnswer !== null) return; // already submitted

  const safeText = text.trim().substring(0, 150) || "...";
  player.textAnswer = safeText;

  const rd         = room.liarGame.roundData;
  const isSubject  = socketId === rd.subjectId;

  rd.answers[socketId] = { text: safeText, isTrue: isSubject };

  // Ack to the player
  sendToPlayer(room, socketId, "LIAR_ANSWER_RECEIVED", { text: safeText });

  // Tell host how many have answered
  const expectedCount = Object.keys(room.players).length;
  const answeredCount = Object.keys(rd.answers).length;
  sendToHost(room, "LIAR_WRITING_PROGRESS", { answered: answeredCount, total: expectedCount });

  // Auto-advance when everyone has answered
  if (answeredCount >= expectedCount) {
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    transitionToVoting(room);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VOTING PHASE
// ─────────────────────────────────────────────────────────────────────────────

function transitionToVoting(room) {
  const rd = room.liarGame.roundData;
  room.state = "liar_voting";

  // Fill in blank answers for anyone who didn't submit in time
  Object.keys(room.players).forEach((id) => {
    if (!rd.answers[id]) {
      const isSubject = id === rd.subjectId;
      rd.answers[id] = { text: "...", isTrue: isSubject };
    }
  });

  // Build a shuffled list of answers to display (hide whose is whose)
  const shuffled = shuffleAnswers(rd.answers);

  // Host sees the full list
  sendToHost(room, "LIAR_VOTING_START", {
    question    : rd.question,
    subjectName : rd.subjectName,
    answers     : shuffled,   // [{ answerId, text }]  — no isTrue exposed
    votingTime  : VOTING_TIME,
    phase       : "voting",
  });

  // Subject sits this phase out
  sendToPlayer(room, rd.subjectId, "LIAR_WAIT_VOTING", {
    message: "Others are voting on your answer. Sit tight!",
  });

  // Everyone else gets to vote
  Object.keys(room.players).forEach((id) => {
    if (id === rd.subjectId) return;
    sendToPlayer(room, id, "LIAR_VOTING_START", {
      question   : rd.question,
      subjectName: rd.subjectName,
      answers    : shuffled,
      votingTime : VOTING_TIME,
    });
  });

  startVotingTimer(room);
}

function startVotingTimer(room) {
  let remaining = VOTING_TIME;

  room.timer = setInterval(() => {
    remaining--;
    broadcastToAll(room, "LIAR_TIMER", { phase: "voting", remaining });

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      revealResults(room);
    }
  }, 1000);
}

/**
 * Called by wsHandler when a player sends SUBMIT_VOTE.
 * votedForId is the socketId of the player whose answer they chose.
 */
function handleVote(room, voterSocketId, votedForId) {
  if (room.state !== "liar_voting") return;

  const rd = room.liarGame.roundData;

  // Subject cannot vote
  if (voterSocketId === rd.subjectId) return;

  // Ignore duplicate votes
  if (rd.votes[voterSocketId] !== undefined) return;

  // Validate the target exists
  if (!room.players[votedForId]) return;

  rd.votes[voterSocketId] = votedForId;

  sendToPlayer(room, voterSocketId, "LIAR_VOTE_RECEIVED", {});

  // Count eligible voters (everyone except subject)
  const eligibleVoters = Object.keys(room.players).filter(id => id !== rd.subjectId);
  const votesCast      = Object.keys(rd.votes).length;

  sendToHost(room, "LIAR_VOTING_PROGRESS", {
    voted: votesCast,
    total: eligibleVoters.length,
  });

  // Auto-advance when all eligible players have voted
  if (votesCast >= eligibleVoters.length) {
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    revealResults(room);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVEAL PHASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by wsHandler when host sends FORCE_REVEAL, or automatically when timer ends.
 */
function forceReveal(room) {
  if (room.state !== "liar_voting") return;
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  revealResults(room);
}

function revealResults(room) {
  room.state = "liar_reveal";

  const rd      = room.liarGame.roundData;
  const players = room.players;

  // Award points
  const pointsLog = []; // for the broadcast payload

  Object.entries(rd.votes).forEach(([voterId, targetId]) => {
    const voter   = players[voterId];
    const target  = players[targetId];
    const isTrue  = rd.answers[targetId]?.isTrue ?? false;

    if (isTrue) {
      // Voter found the truth
      voter.score          += POINTS_VOTER_CORRECT;
      voter.lastPoints      = POINTS_VOTER_CORRECT;
      players[rd.subjectId].score      += POINTS_SUBJECT_CAUGHT;
      players[rd.subjectId].lastPoints  =
        (players[rd.subjectId].lastPoints || 0) + POINTS_SUBJECT_CAUGHT;

      pointsLog.push({
        voterId,
        voterName  : voter.name,
        targetId,
        correct    : true,
        voterPoints: POINTS_VOTER_CORRECT,
      });
    } else {
      // Voter was fooled — lie author gets the reward
      target.score      += POINTS_LIE_CHOSEN;
      target.lastPoints  = (target.lastPoints || 0) + POINTS_LIE_CHOSEN;

      pointsLog.push({
        voterId,
        voterName   : voter.name,
        targetId,
        targetName  : target.name,
        correct     : false,
        targetPoints: POINTS_LIE_CHOSEN,
      });
    }
  });

  // Build full reveal payload
  // Expose every answer with its real author now
  const revealedAnswers = Object.entries(rd.answers).map(([ownerId, { text, isTrue }]) => ({
    ownerId,
    ownerName : players[ownerId]?.name ?? "?",
    text,
    isTrue,
  }));

  const leaderboard = getLeaderboard(room);

  const revealPayload = {
    question        : rd.question,
    subjectName     : rd.subjectName,
    subjectId       : rd.subjectId,
    answers         : revealedAnswers,
    votes           : rd.votes,
    pointsLog,
    leaderboard,
    round           : room.liarGame.currentRound + 1,
    totalRounds     : room.liarGame.subjectOrder.length,
    isLastRound     : room.liarGame.currentRound + 1 >= room.liarGame.subjectOrder.length,
  };

  // Host sees everything
  sendToHost(room, "LIAR_ROUND_REVEAL", revealPayload);

  // Each player gets the same full reveal (leaderboard + points)
  broadcastToPlayers(room, "LIAR_ROUND_REVEAL", {
    ...revealPayload,
    // (no sensitive data to hide at this point)
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// END GAME
// ─────────────────────────────────────────────────────────────────────────────

function endGame(room) {
  room.state = "finished";

  const leaderboard = getLeaderboard(room);
  const winner      = leaderboard[0];

  broadcastToAll(room, "GAME_OVER", {
    leaderboard,
    winner: {
      id          : winner.id,
      name        : winner.name,
      score       : winner.score,
      victoryQuote: winner.victoryQuote,
    },
  });

  console.log(`[LiarGame] Room ${room.code} finished. Winner: ${winner.name}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a shuffled array of { answerId (= socketId), text }.
 * The isTrue flag is intentionally excluded so clients can't cheat.
 */
function shuffleAnswers(answersMap) {
  const entries = Object.entries(answersMap).map(([id, { text }]) => ({
    answerId : id,
    text,
  }));

  // Fisher-Yates shuffle
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  startLiarGame,
  nextRound,
  handleTextAnswer,
  handleVote,
  forceReveal,
};