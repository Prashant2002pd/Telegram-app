const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

let games = {};
let players = [];

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("findgame", (playerName) => {
    console.log("findgame", playerName);

    // Add the player to the waiting list
    players.push({ id: socket.id, name: playerName });

    if (players.length === 2) {
      const gameId = `${players[0].id}-${players[1].id}`;
      games[gameId] = {
        players: [
          { ...players[0], playingas: "X" }, // Player 1 is 'X'
          { ...players[1], playingas: "O" }, // Player 2 is 'O'
        ],
        gamestate: Array(9).fill(null),
        turn: players[0].id, // Player 1 starts
      };

      // Notify both players that the game has started
      players.forEach((player, index) => {
        io.to(player.id).emit("startgame", {
          playerName: player.name,
          opponentName: players[1 - index].name,
          playerId: player.id,
          opponentId: players[1 - index].id,
          playingas: games[gameId].players[index].playingas,
        });
      });

      players = [];
    }
  });

  socket.on("move", (data) => {
    console.log("move", data);

    const { target, playingas, opponentId } = data;
    const gameId =
      `${socket.id}-${opponentId}` in games
        ? `${socket.id}-${opponentId}`
        : `${opponentId}-${socket.id}`;

    const game = games[gameId];

    if (!game || game.turn !== socket.id || game.gamestate[target] !== null) {
      return; // Invalid move
    }

    // Update game state
    game.gamestate[target] = playingas;

    // Check for win/loss/draw
    const winner = checkWinner(game.gamestate);
    if (winner) {
      io.to(game.players[0].id).emit("gameover", { winner });
      io.to(game.players[1].id).emit("gameover", { winner });
      delete games[gameId];
      return;
    }

    if (!game.gamestate.includes(null)) {
      // Game is a draw
      io.to(game.players[0].id).emit("gameover", { winner: "draw" });
      io.to(game.players[1].id).emit("gameover", { winner: "draw" });
      delete games[gameId];
      return;
    }

    // Switch turn
    game.turn = opponentId;

    // Notify players of the move
    io.to(game.players[0].id).emit("gamestate", game.gamestate);
    io.to(game.players[1].id).emit("gamestate", game.gamestate);

    // Notify opponent of the move
    io.to(opponentId).emit("move", { target, playingas });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

// Function to check for a winner
function checkWinner(gamestate) {
  const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of winningCombinations) {
    if (
      gamestate[a] &&
      gamestate[a] === gamestate[b] &&
      gamestate[a] === gamestate[c]
    ) {
      return gamestate[a];
    }
  }
  return null;
}

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
