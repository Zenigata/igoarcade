'use strict';

// require
require('wgo');
var pachi = require('pachi');

// constantes
var boardSize = 9;
var board, game, gtp;
var alreadyPassed = false;
var markers;

var startNewGame = function(boardSize) {
  var elem = document.getElementById('board');
  board = new WGo.Board(elem, {
    width: 600,
    size: boardSize
  });

  game = new WGo.Game(boardSize);

  /* Pachi */
  gtp = pachi({playouts:5000, theads:4, pondering:false, maximize_score:true, pass_all_alive:true});
  gtp.send('boardsize ' + board.size, function(error, response) {});
  gtp.send('time_settings 0 3 1', function(error, response) {});

  enableGoban();
};


var disableGoban = function() {
  board.removeEventListener('click', playerPlay);
  disablePassButton();
};


var enableGoban = function() {
  board.addEventListener('click', playerPlay);
  enablePassButton();
};

var playerPlay = function(x, y) {
  if (!moveAllowed(x, y)) {
    return;
  }
  disableGoban();
  removeMarkers();

  var add = [];

  board.addObject({
    x: x,
    y: y,
    c: game.turn
  });
  add.push({
    x: x,
    y: y,
    type: 'CR'
  });
  markers = add;
  board.addObject(add);

  var res = game.play(x, y);
  if (res.length > 0) {
    board.update({remove: res});
  }
  updateCaptures();

  // coup de l'ordinateur
  var coord = numberToLetterCoordinates(x, y);
  gtp.send('play b ' + coord.x  + coord.y, function(error, response) {});
  computerPlay();
};

var removeMarkers = function() {
  if (markers) {
    board.removeObject(markers);
  }
};

var computerPlay = function() {
  gtp.send('genmove white', function(error, response) {
    console.log('move: '+response);
    if (response && response !== '') {
      if (response === 'resign') {
        displayMessage('L\'ordinateur abandonne');
        gameEnd();
      }
      else if (response === 'pass') {
        if (alreadyPassed) {
          gameEnd();
        } else {
          alreadyPassed = true;
        }
      }
      else {
        var move = letterToNumberCoordinates(response.charAt(0), response.charAt(1));

        removeMarkers();

        // coup du joueur
        var add = [];

        board.addObject({
          x: move.x,
          y: move.y,
          c: game.turn
        });
        add.push({
          x: move.x,
          y: move.y,
          type: 'CR'
        });
        markers = add;
        board.addObject(add);

        var res = game.play(move.x, move.y);
        if (res.length > 0) {
          board.update({remove: res});
        }
        updateCaptures();

        enableGoban();
      }
    }

  });
};

var enablePassButton = function() {
  var pass = document.getElementById('pass');
  pass.addEventListener('click', playerPass);
};

var disablePassButton = function() {
  var pass = document.getElementById('pass');
  pass.removeEventListener('click', playerPass);
};

var playerPass = function() {
  game.pass();
  alreadyPassed = true;
  gtp.send('play b pass', function(error, response) {});
  computerPlay();
};

var gameEnd = function() {
  getScore();
  disableGoban();
};

var getScore = function() {
  gtp.send('final_score', function(error, response) {
    if (response === '0') {
      displayMessage('Égalité parfaite !');
    } else {
      var res = response.split('+');
      var points = res[1].substring(0, res[1].indexOf('.0'));
      var message = (res[0] == 'W' ? 'Blanc' : 'Noir');
      message += ' gagne de ' + points + ' point';
      if (points !== '1' && points !== '1.5') {
        message += 's';
      }
      message += ' !';
      displayMessage(message);
    }
  });
};

var displayMessage = function(msg) {
  var message = document.getElementById('message');
  message.innerHTML = msg;
};

var newGame = function() {
  var button = document.getElementById('newgame');
  button.addEventListener('click', function() {
    startNewGame(boardSize);
  });
};

var moveAllowed = function(x, y) {
  //console.log('x:' + x + ' y:' + y + ' ' + game.isValid(x, y));
  return game.isValid(x, y);
};

var updateCaptures = function() {
  var caps = document.getElementById('captures-noir');
  caps.innerHTML = game.getPosition().capCount.black;
  var caps = document.getElementById('captures-blanc');
  caps.innerHTML = game.getPosition().capCount.white;
};


/* Utils */

// les coordonnées
var numberToLetterCoordinates = function(x, y) {
  var ch = x+"A".charCodeAt(0);
  if(ch >= "I".charCodeAt(0)) ch++;
  return {x: String.fromCharCode(ch), y: board.size-y};
};

var letterToNumberCoordinates = function(l, y) {
  var x = l.charCodeAt(0) - "A".charCodeAt(0);
  if(l.charCodeAt(0) >= "I".charCodeAt(0)) x--;
  return {x: x, y: Math.abs(y-board.size)};
};

newGame();
