"use strict";

var world,
    game,
    input = {
      keys: {}
    },
    noop = function() {};

window.addEventListener("keydown", function(e) {
  var key = keyboardMap[e.keyCode];
  input.keys[key] = true;

  e.preventDefault();
  return false;
});

window.addEventListener("keyup", function(e) {
  var key = keyboardMap[e.keyCode];
  delete input.keys[key];

  e.preventDefault();
  return false;
});

var Game = function(context, width, height) {
  this.context = context;
  this.width = width;
  this.height = height;

  this.objects = [];

  context.lineWidth = 2;
  context.strokeStyle = context.fillStyle = "white";
};

Game.prototype.constructor = Game;

// idempotently add an object to the game for the update/render loop
Game.prototype.addObject = function addObject(object) {
  if (this.objects.indexOf(object) === -1) {
    this.objects.push(object);
  }
};

// idempotently rmoeve an object from the game for the update/render loop
Game.prototype.removeObject = function removeObject(object) {
  var index = this.objects.indexOf(object);
  if (index > -1) {
    this.objects.splice(index, 1);
  }
};

Game.prototype.setUp = function setUp() {
  world = new p2.World({
    gravity: [0, 0]
  });
  world.defaultContactMaterial.friction = 0;

  new Ship([400, 200]);

  new Asteroid(75, 8, [50, 50], [20, 20], 0.05),
  new Asteroid(75, 8, [200, 200], [20, 20], 0.05),
  new Asteroid(75, 8, [400, 400], [20, 20], 0.05)
};

Game.prototype.start = function start() {
  this.tick();
};

Game.prototype.tick = function tick() {
  var now = Date.now();

  // TODO use world.on postTick ?!?!
  this.update(now - this.lastTick);
  this.render();

  this.lastTick = now;

  window.setTimeout(this.tick.bind(this), 20, this);
};

Game.prototype.update = function update(timeDelta) {
  var secondsDelta = timeDelta / 1000;

  world.step(1 / 60, secondsDelta);

  this.objects.forEach(function(object) {
    object.update(secondsDelta);
  });
};

Game.prototype.render = function render() {
  this.context.clearRect(0, 0, this.width, this.height);

  this.objects.forEach(function(object) {
    object.render(this.context);
  }.bind(this));
};

var Ship = function(position) {
  this.body = new p2.Body({
    angularDamping: 0,
    damping: 0,
    mass: 1,
    position: position
  });

  this.body.addShape(
    new p2.Circle({ radius: 20 })
  );

  world.addBody(this.body);
  game.addObject(this);

  this.attachments = [
    new Thruster(this, [-18, -12], Math.PI, ["E", "DOWN", "LEFT"]),
    new Thruster(this, [18, -12], Math.PI, ["I", "DOWN", "RIGHT"]),
    new Thruster(this, [18, 12], 0, ["J", "UP", "LEFT"]),
    new Thruster(this, [-18, 12], 0, ["F", "UP", "RIGHT"]),
    new Harpoon(this, [0, 22], 0, ["SPACE"])
  ];

  this.preContactVelocity = [];
  this.destroyed = false;

  world.on("beginContact", function(e) {
    if (this.body === e.bodyA || this.body === e.bodyB) {
      this.beginContact();
    }
  }.bind(this));

  world.on("endContact", function(e) {
    if (this.body === e.bodyA || this.body === e.bodyB) {
      this.endContact();
    }
  }.bind(this));
};

Ship.prototype.constructor = Ship;

Ship.prototype.update = function update() {
  this.attachments.forEach(function(attachment) {
    attachment.update();
  }.bind(this));
};

Ship.prototype.render = function render(context) {
  if (this.destroyed) {
    return;
  }

  context.save();
  context.translate(
    this.body.interpolatedPosition[0],
    this.body.interpolatedPosition[1]
  );
  context.rotate(this.body.interpolatedAngle);

  context.beginPath();
  context.moveTo(0, -18);
  context.lineTo(21, -9);
  context.lineTo(30, 12);
  context.lineTo(0, 12);
  context.lineTo(-30, 12);
  context.lineTo(-21, -9);
  context.closePath();
  context.stroke();

  if (DEBUG) {
    // draw spot on the centre
    context.save();
    context.fillStyle = "red";
    context.fillRect(-1, -1, 2, 2);
    context.restore();

    // draw collision shape
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.3)";
    context.beginPath();
    context.arc(
      this.body.shapes[0].position[0],
      this.body.shapes[0].position[1],
      this.body.shapes[0].radius,
      0,
      2 * Math.PI
    );
    context.fill();
    context.restore();
  }

  this.attachments.forEach(function(attachment) {
    attachment.render(context);
  });

  context.restore();
};

Ship.prototype.beginContact = function beginContact() {
  p2.vec2.copy(this.preContactVelocity, this.body.velocity);
};

Ship.prototype.endContact = function endContact() {
  var dv = [], magnitude;

  p2.vec2.subtract(dv, this.body.velocity, this.preContactVelocity);
  magnitude = p2.vec2.length(dv);

  if (magnitude > 10) {
    this.explode();
  }
};

Ship.prototype.explode = function explode() {
  var i, vector;

  for (i = 0; i < 600; ++i) {
    vector = [0, 5 + 25 * Math.random()];
    p2.vec2.rotate(vector, vector, 2 * Math.PI * Math.random());

    new ExhaustParticle(this.body.position, vector)
  }

  this.destroyed = true;
  world.removeBody(this.body);
};

var Thruster = function(ship, position, angle, keys) {
  this.ship = ship;
  this.position = position;
  this.angle = angle;
  this.keys = keys;

  this.firing = false;
  this.particles = [];

  world.on("postStep", this.postStep.bind(this));
};

Thruster.prototype.render = function render(context) {
  context.save();
  context.translate(this.position[0], this.position[1]);
  context.rotate(this.angle);

  if (this.firing) {
    context.fillStyle = "red";
  }

  this.particles.forEach(function(particle) {
    particle.render(context);
  });

  context.beginPath();
  context.moveTo(3, 3);
  context.lineTo(-3, 3);
  context.lineTo(-3, -2);
  context.arc(0, -2, 3, 1 * Math.PI, 2 * Math.PI);
  context.closePath();
  context.fill();

  context.restore();
};

Thruster.prototype.postStep = function postStep() {
  if (this.firing) {
    var force = [0, -10];
    p2.vec2.rotate(force, force, this.angle);

    this.ship.body.applyForceLocal(force, this.position);

    this.spawnParticles(force);
  }
};

// TODO use keydown/up event to trigger this
Thruster.prototype.update = function update() {
  this.firing = false;
  this.keys.forEach(function(key) {
    this.firing = this.firing || input.keys[key];
  }.bind(this));
};

Thruster.prototype.spawnParticles = function spawnParticles(vector) {
  var worldPosition = [], worldVector = [];

  this.ship.body.toWorldFrame(worldPosition, this.position);
  this.ship.body.vectorToWorldFrame(worldVector, vector);
  p2.vec2.negate(worldVector, worldVector);

  new ExhaustParticle(worldPosition, worldVector);
};

var ExhaustParticle = function(position, vector) {
  this.position = [];
  this.velocity = [];

  p2.vec2.copy(this.position, position);

  p2.vec2.scale(this.velocity, vector, 1.5 + Math.random());
  p2.vec2.rotate(this.velocity, this.velocity, (0.25 * Math.random() - 0.125) * Math.PI);

  this.timeToLive = 1;

  this.size = 6 + Math.random() * 4;
  this.angle = 0;
  this.angularVelocity = 20 * Math.random() - 10;

  this.r = Math.ceil(210 + 45 * Math.random());
  this.g = Math.ceil(160 + 95 * Math.random());
  this.b = Math.ceil(100 + 155 * Math.random());
  this.a = 0.1 + Math.random() * 0.3;

  game.addObject(this);
};

ExhaustParticle.prototype.constructor = ExhaustParticle;

ExhaustParticle.prototype.render = function render(context) {
  context.save();
  context.translate(
    this.position[0],
    this.position[1]
  );
  context.rotate(this.angle);

  var size = this.size * (this.timeToLive * 0.5 + 0.5);

  context.fillStyle = "rgba(" + this.r + ", " + this.g + ", " + this.b + ", " + this.a + ")";
  context.fillRect(-size / 2, -size / 2, size, size);

  context.restore();
};

ExhaustParticle.prototype.update = function update(timeDelta) {
  this.timeToLive -= timeDelta;

  if (this.timeToLive > 0) {
    this.position[0] += this.velocity[0] * timeDelta;
    this.position[1] += this.velocity[1] * timeDelta;
    this.angle += this.angularVelocity * timeDelta;
  }
  else {
    game.removeObject(this);
  }
};

var Asteroid = function(radius, verticesCount, position, velocity, angularVelocity) {
  this.vertices = [];

  for (var i = 0; i < verticesCount; i++) {
    var angle = i * 2 * Math.PI / verticesCount,
        x = radius * Math.cos(angle) + (Math.random() - 0.5) * radius * 0.3,
        y = radius * Math.sin(angle) + (Math.random() - 0.5) * radius * 0.3;

    this.vertices.push([x, y]);
  }

  this.body = new p2.Body({
    angularDamping: 0,
    damping: 0,
    mass: 10,
    position: position,
    velocity: velocity,
    angularVelocity: angularVelocity
  });

  this.body.fromPolygon(this.vertices);

  world.addBody(this.body);
  game.addObject(this);
};

Asteroid.prototype.constructor = Asteroid;

Asteroid.prototype.render = function render(context) {
  context.save();
  context.translate(
    this.body.interpolatedPosition[0],
    this.body.interpolatedPosition[1]
  );
  context.rotate(this.body.interpolatedAngle);

  context.beginPath();
  this.body.shapes[0].vertices.forEach(function(vertex) {
    context.lineTo(vertex[0], vertex[1]);
  });
  context.closePath();
  context.stroke();

  if (DEBUG) {
    // draw spot on the centre
    context.save();
    context.fillStyle = "red";
    context.fillRect(
      -1 + this.body.shapes[0].position[0],
      -1 + this.body.shapes[0].position[1],
      2,
      2
    );
    context.restore();
  }

  context.restore();
};

Asteroid.prototype.update = noop;

var Harpoon = function(ship, position, angle, keys) {
  this.ship = ship;
  this.position = position;
  this.angle = angle;
  this.keys = keys;

  this.loaded = true;
};

// TODO use keydown/up event to trigger this
Harpoon.prototype.update = function update() {
  var shouldFire = false

  this.keys.forEach(function(key) {
    shouldFire = shouldFire || input.keys[key];
  });

  if (shouldFire && this.loaded) {
    this.fire();
  }
};

Harpoon.prototype.fire = function fire() {
  var worldPosition = [],
      worldVector = [],
      vector = [0, 150];

  this.ship.body.toWorldFrame(worldPosition, this.position);

  p2.vec2.rotate(vector, vector, this.angle);
  this.ship.body.vectorToWorldFrame(worldVector, vector);

  this.projectile = new HarpoonProjectile(worldPosition, worldVector, this);
  this.loaded = false;
};

Harpoon.prototype.render = noop;

var HarpoonProjectile = function(position, velocity, launcher) {
  this.struck = false;

  this.body = new p2.Body({
    mass: 1,
    position: position,
    velocity: velocity
  });

  var sensor = new p2.Circle({
    radius: 1,
    sensor: true
  });

  this.body.addShape(sensor);
  world.addBody(this.body);

  world.on("beginContact", function(e) {
    if (this.body === e.bodyA || this.body === e.bodyB) {
      world.removeBody(this.body);
      game.removeObject(this);
      this.createTether(launcher, e);
    }
  }.bind(this));

  game.addObject(this);
};

HarpoonProjectile.prototype.constructor = HarpoonProjectile;

HarpoonProjectile.prototype.createTether = function createTether(launcher, e) {
  var otherBody = (this.body === e.bodyA) ? e.bodyB : e.bodyA,
      otherBodyPosition = [];

  otherBody.toLocalFrame(otherBodyPosition, this.body.position);

  new HarpoonTether(launcher.ship.body, launcher.position, otherBody, otherBodyPosition);
};

HarpoonProjectile.prototype.render = function render(context) {
  context.save();
  context.translate(
    this.body.interpolatedPosition[0],
    this.body.interpolatedPosition[1]
  );
  context.rotate(this.body.interpolatedAngle);

  context.fillRect(-1, -1, 2, 2);

  if (DEBUG) {
    context.beginPath();
    context.arc(0, 0, 10, 0, 2 * Math.PI);
    context.fillStyle = this.struck ? "rgba(0, 255, 0, 0.5)" : "rgba(255, 0, 0, 0.5)";
    context.fill();
  }

  context.restore();
};

HarpoonProjectile.prototype.update = noop;

var HarpoonTether = function(startBody, startPosition, endBody, endPosition) {
  this.startBody = startBody;
  this.startPosition = startPosition;
  this.endBody = endBody;
  this.endPosition = endPosition;

  var spring = new p2.LinearSpring(
    this.startBody,
    this.endBody,
    {
      stiffness: 1000,
      localAnchorA: this.startPosition,
      localAnchorB: this.endPosition
    }
  );

  world.addSpring(spring);
  game.addObject(this);
};

HarpoonTether.prototype.update = noop;

HarpoonTether.prototype.render = function render(context) {
  var start = [],
      end = [];

  this.startBody.toWorldFrame(start, this.startPosition);
  this.endBody.toWorldFrame(end, this.endPosition);

  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(end[0], end[1]);
  context.stroke();
}

var keyboardMap = [
  "", // [0]
  "", // [1]
  "", // [2]
  "CANCEL", // [3]
  "", // [4]
  "", // [5]
  "HELP", // [6]
  "", // [7]
  "BACK_SPACE", // [8]
  "TAB", // [9]
  "", // [10]
  "", // [11]
  "CLEAR", // [12]
  "ENTER", // [13]
  "ENTER_SPECIAL", // [14]
  "", // [15]
  "SHIFT", // [16]
  "CONTROL", // [17]
  "ALT", // [18]
  "PAUSE", // [19]
  "CAPS_LOCK", // [20]
  "KANA", // [21]
  "EISU", // [22]
  "JUNJA", // [23]
  "FINAL", // [24]
  "HANJA", // [25]
  "", // [26]
  "ESCAPE", // [27]
  "CONVERT", // [28]
  "NONCONVERT", // [29]
  "ACCEPT", // [30]
  "MODECHANGE", // [31]
  "SPACE", // [32]
  "PAGE_UP", // [33]
  "PAGE_DOWN", // [34]
  "END", // [35]
  "HOME", // [36]
  "LEFT", // [37]
  "UP", // [38]
  "RIGHT", // [39]
  "DOWN", // [40]
  "SELECT", // [41]
  "PRINT", // [42]
  "EXECUTE", // [43]
  "PRINTSCREEN", // [44]
  "INSERT", // [45]
  "DELETE", // [46]
  "", // [47]
  "0", // [48]
  "1", // [49]
  "2", // [50]
  "3", // [51]
  "4", // [52]
  "5", // [53]
  "6", // [54]
  "7", // [55]
  "8", // [56]
  "9", // [57]
  "COLON", // [58]
  "SEMICOLON", // [59]
  "LESS_THAN", // [60]
  "EQUALS", // [61]
  "GREATER_THAN", // [62]
  "QUESTION_MARK", // [63]
  "AT", // [64]
  "A", // [65]
  "B", // [66]
  "C", // [67]
  "D", // [68]
  "E", // [69]
  "F", // [70]
  "G", // [71]
  "H", // [72]
  "I", // [73]
  "J", // [74]
  "K", // [75]
  "L", // [76]
  "M", // [77]
  "N", // [78]
  "O", // [79]
  "P", // [80]
  "Q", // [81]
  "R", // [82]
  "S", // [83]
  "T", // [84]
  "U", // [85]
  "V", // [86]
  "W", // [87]
  "X", // [88]
  "Y", // [89]
  "Z", // [90]
  "OS_KEY", // [91] Windows Key (Windows) or Command Key (Mac)
  "", // [92]
  "CONTEXT_MENU", // [93]
  "", // [94]
  "SLEEP", // [95]
  "NUMPAD0", // [96]
  "NUMPAD1", // [97]
  "NUMPAD2", // [98]
  "NUMPAD3", // [99]
  "NUMPAD4", // [100]
  "NUMPAD5", // [101]
  "NUMPAD6", // [102]
  "NUMPAD7", // [103]
  "NUMPAD8", // [104]
  "NUMPAD9", // [105]
  "MULTIPLY", // [106]
  "ADD", // [107]
  "SEPARATOR", // [108]
  "SUBTRACT", // [109]
  "DECIMAL", // [110]
  "DIVIDE", // [111]
  "F1", // [112]
  "F2", // [113]
  "F3", // [114]
  "F4", // [115]
  "F5", // [116]
  "F6", // [117]
  "F7", // [118]
  "F8", // [119]
  "F9", // [120]
  "F10", // [121]
  "F11", // [122]
  "F12", // [123]
  "F13", // [124]
  "F14", // [125]
  "F15", // [126]
  "F16", // [127]
  "F17", // [128]
  "F18", // [129]
  "F19", // [130]
  "F20", // [131]
  "F21", // [132]
  "F22", // [133]
  "F23", // [134]
  "F24", // [135]
  "", // [136]
  "", // [137]
  "", // [138]
  "", // [139]
  "", // [140]
  "", // [141]
  "", // [142]
  "", // [143]
  "NUM_LOCK", // [144]
  "SCROLL_LOCK", // [145]
  "WIN_OEM_FJ_JISHO", // [146]
  "WIN_OEM_FJ_MASSHOU", // [147]
  "WIN_OEM_FJ_TOUROKU", // [148]
  "WIN_OEM_FJ_LOYA", // [149]
  "WIN_OEM_FJ_ROYA", // [150]
  "", // [151]
  "", // [152]
  "", // [153]
  "", // [154]
  "", // [155]
  "", // [156]
  "", // [157]
  "", // [158]
  "", // [159]
  "CIRCUMFLEX", // [160]
  "EXCLAMATION", // [161]
  "DOUBLE_QUOTE", // [162]
  "HASH", // [163]
  "DOLLAR", // [164]
  "PERCENT", // [165]
  "AMPERSAND", // [166]
  "UNDERSCORE", // [167]
  "OPEN_PAREN", // [168]
  "CLOSE_PAREN", // [169]
  "ASTERISK", // [170]
  "PLUS", // [171]
  "PIPE", // [172]
  "HYPHEN_MINUS", // [173]
  "OPEN_CURLY_BRACKET", // [174]
  "CLOSE_CURLY_BRACKET", // [175]
  "TILDE", // [176]
  "", // [177]
  "", // [178]
  "", // [179]
  "", // [180]
  "VOLUME_MUTE", // [181]
  "VOLUME_DOWN", // [182]
  "VOLUME_UP", // [183]
  "", // [184]
  "", // [185]
  "SEMICOLON", // [186]
  "EQUALS", // [187]
  "COMMA", // [188]
  "MINUS", // [189]
  "PERIOD", // [190]
  "SLASH", // [191]
  "BACK_QUOTE", // [192]
  "", // [193]
  "", // [194]
  "", // [195]
  "", // [196]
  "", // [197]
  "", // [198]
  "", // [199]
  "", // [200]
  "", // [201]
  "", // [202]
  "", // [203]
  "", // [204]
  "", // [205]
  "", // [206]
  "", // [207]
  "", // [208]
  "", // [209]
  "", // [210]
  "", // [211]
  "", // [212]
  "", // [213]
  "", // [214]
  "", // [215]
  "", // [216]
  "", // [217]
  "", // [218]
  "OPEN_BRACKET", // [219]
  "BACK_SLASH", // [220]
  "CLOSE_BRACKET", // [221]
  "QUOTE", // [222]
  "", // [223]
  "META", // [224]
  "ALTGR", // [225]
  "", // [226]
  "WIN_ICO_HELP", // [227]
  "WIN_ICO_00", // [228]
  "", // [229]
  "WIN_ICO_CLEAR", // [230]
  "", // [231]
  "", // [232]
  "WIN_OEM_RESET", // [233]
  "WIN_OEM_JUMP", // [234]
  "WIN_OEM_PA1", // [235]
  "WIN_OEM_PA2", // [236]
  "WIN_OEM_PA3", // [237]
  "WIN_OEM_WSCTRL", // [238]
  "WIN_OEM_CUSEL", // [239]
  "WIN_OEM_ATTN", // [240]
  "WIN_OEM_FINISH", // [241]
  "WIN_OEM_COPY", // [242]
  "WIN_OEM_AUTO", // [243]
  "WIN_OEM_ENLW", // [244]
  "WIN_OEM_BACKTAB", // [245]
  "ATTN", // [246]
  "CRSEL", // [247]
  "EXSEL", // [248]
  "EREOF", // [249]
  "PLAY", // [250]
  "ZOOM", // [251]
  "", // [252]
  "PA1", // [253]
  "WIN_OEM_CLEAR", // [254]
  "" // [255]
];
