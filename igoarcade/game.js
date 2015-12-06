'use strict';

// require
require('wgo');
var pachi = require('pachi');

// constantes
var boardSize = 7;
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
        disableGoban();
        gtp.exit();
        displayMessage('L\'ordinateur abandonne');
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
  disableGoban();
  displayTerritory();
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
    gtp.exit();
  });
};

var displayTerritory = function() {
  gtp.send('final_status_list dead', function(error, response) {
    var originalPosition = game.getPosition();
    var position = game.getPosition().clone();

    //calculate(position);
    updateScoreBoard(position, originalPosition, response);
    getScore();
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

/* WGo */
var state = {
	UNKNOWN: 0,
	BLACK_STONE: 1, // must be equal to WGo.B
	WHITE_STONE: -1, // must be equal to WGo.W
	BLACK_CANDIDATE: 2,
	WHITE_CANDIDATE: -2,
	BLACK_NEUTRAL: 3,
	WHITE_NEUTRAL: -3,
	NEUTRAL: 4
};

var calculate = function(position) {
	var p, s, t, b, w, change;

	// 1. create testing position, empty fields has flag ScoreMode.UNKNOWN
	p = position;

	// 2. repeat until there is some change of state:
	change = true;
	while(change) {
		change = false;

		// go through the whole position
		for(var i = 0; i < p.size; i++) {
			//var str = "";
			for(var j = 0; j < p.size; j++) {
				s = p.get(j,i);

				if(s == state.UNKNOWN || s == state.BLACK_CANDIDATE || s == state.WHITE_CANDIDATE) {
					// get new state
					t = [p.get(j-1, i), p.get(j, i-1), p.get(j+1, i), p.get(j, i+1)];
					b = false;
					w = false;

					for(var k = 0; k < 4; k++) {
						if(t[k] == state.BLACK_STONE || t[k] == state.BLACK_CANDIDATE) b = true;
						else if(t[k] == state.WHITE_STONE || t[k] == state.WHITE_CANDIDATE) w = true;
						else if(t[k] == state.NEUTRAL) {
							b = true;
							w = true;
						}
					}

					t = false;

					if(b && w) t = state.NEUTRAL;
					else if(b) t = state.BLACK_CANDIDATE;
					else if(w) t = state.WHITE_CANDIDATE;

					if(t && s != t) {
						change = true;
						p.set(j, i, t);
					}
				}
				//str += (p.get(j,i)+5)+" ";
			}
			//console.log(str);
		}
		//console.log("------------------------------------------------------------");
	}
};

var updateScoreBoard = function(position, originalPosition, deadStones) {
	var score = {
		black: [],
		white: [],
		neutral: []
	}

  var s;

  // dead stones
  if (deadStones) {
    var caps = deadStones.split(' ');
    for (var i=0; i<caps.length; i++) {
      var move = letterToNumberCoordinates(caps[i].charAt(0), caps[i].charAt(1));
      s = originalPosition.get(move.x, move.y);
      board.removeObjectsAt(move.x, move.y);
      if (s != state.WHITE_STONE) {
        score.white.push({x: move.x, y: move.y, type: "outline", c: WGo.B});
        position.set(move.x, move.y, state.WHITE_CANDIDATE);
      } else {
        score.black.push({x: move.x, y: move.y, type: "outline", c: WGo.W});
        position.set(move.x, move.y, state.BLACK_CANDIDATE);
      }
    }
  }

  calculate(position);

	for(var i = 0; i < position.size; i++) {
		for(var j = 0; j < position.size; j++) {
			s = position.get(i,j);

			if(s == state.BLACK_CANDIDATE) score.black.push({x: i, y: j, type: "mini", c: WGo.B});
			else if(s == state.WHITE_CANDIDATE) score.white.push({x: i, y: j, type: "mini", c: WGo.W});
			else if(s == state.NEUTRAL) score.neutral.push({x: i, y: j});
		}
	}

	board.addObject(score.black);
	board.addObject(score.white);

};

newGame();
