(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const context = canvas.getContext("2d");
  const scoreValue = document.querySelector("#scoreValue");
  const highScoreValue = document.querySelector("#highScoreValue");
  const levelValue = document.querySelector("#levelValue");
  const livesValue = document.querySelector("#livesValue");
  const overlay = document.querySelector("#gameOverlay");
  const overlayKicker = document.querySelector("#overlayKicker");
  const overlayTitle = document.querySelector("#overlayTitle");
  const overlayDetail = document.querySelector("#overlayDetail");
  const overlayAction = document.querySelector("#overlayAction");
  const pauseButton = document.querySelector("#pauseButton");
  const restartButton = document.querySelector("#restartButton");
  const announcement = document.querySelector("#gameAnnouncement");
  const directionButtons = [...document.querySelectorAll("[data-direction]")];

  const TILE_SIZE = 24;
  const COLS = 19;
  const ROWS = 23;
  const BOARD_WIDTH = COLS * TILE_SIZE;
  const BOARD_HEIGHT = ROWS * TILE_SIZE;
  const TUNNEL_ROW = 10;
  const FIXED_STEP = 1 / 120;
  const MAX_FRAME_TIME = 0.05;
  const PLAYER_SPEED = 5.55;
  const STORAGE_KEY = "neon-maze-high-score-v1";

  // # 벽, . 빛 점, o 에너지 볼, - 유령 문, 공백 통로, T 좌우 터널.
  // 원작의 미로를 복제하지 않은 19 × 23 자체 제작 타일맵이다.
  const MAP_LAYOUT = [
    "###################",
    "#o.......#.......o#",
    "#.###.##.#.##.###.#",
    "#.....#.....#.....#",
    "###.#.#.###.#.#.###",
    "#...#...#.#...#...#",
    "#.###.#.#.#.#.###.#",
    "#.....#.....#.....#",
    "###.#.###-###.#.###",
    "#...#.#     #.#...#",
    "T.....#     #.....T",
    "###.#.#######.#.###",
    "#...#.... ....#...#",
    "#.#.###.#.#.###.#.#",
    "#.#.....#.#.....#.#",
    "#.#####.#.#.#####.#",
    "#.......# #.......#",
    "###.###.#.#.###.###",
    "#.....#.. ..#.....#",
    "#.###.#.#.#.#.###.#",
    "#o..#...#.#...#..o#",
    "#.......#.#.......#",
    "###################",
  ];

  const TILE = Object.freeze({
    WALL: 0,
    DOT: 1,
    POWER: 2,
    DOOR: 3,
    PATH: 4,
    TUNNEL: 5,
  });

  const CHAR_TO_TILE = Object.freeze({
    "#": TILE.WALL,
    ".": TILE.DOT,
    o: TILE.POWER,
    "-": TILE.DOOR,
    " ": TILE.PATH,
    T: TILE.TUNNEL,
  });

  const UP = Object.freeze({ name: "up", dx: 0, dy: -1, angle: -Math.PI / 2 });
  const LEFT = Object.freeze({ name: "left", dx: -1, dy: 0, angle: Math.PI });
  const DOWN = Object.freeze({ name: "down", dx: 0, dy: 1, angle: Math.PI / 2 });
  const RIGHT = Object.freeze({ name: "right", dx: 1, dy: 0, angle: 0 });
  const DIRECTIONS = Object.freeze([UP, LEFT, DOWN, RIGHT]);
  const DIRECTION_BY_NAME = Object.freeze({ up: UP, left: LEFT, down: DOWN, right: RIGHT });

  const PLAYER_SPAWN = Object.freeze({ col: 9, row: 18 });
  const FRUIT_SPAWN = Object.freeze({ col: 9, row: 12 });
  const HOME_TARGET = Object.freeze({ col: 9, row: 9 });
  const HOME_EXIT = Object.freeze({ col: 9, row: 7 });
  const GHOST_SPAWNS = Object.freeze([
    { col: 9, row: 9 },
    { col: 8, row: 10 },
    { col: 10, row: 10 },
    { col: 9, row: 10 },
  ]);

  const GHOST_CONFIG = Object.freeze([
    {
      name: "BEAM",
      color: "#ff4d64",
      pattern: 0,
      release: 0,
      scatter: { col: 17, row: 1 },
    },
    {
      name: "VEX",
      color: "#ff75d8",
      pattern: 1,
      release: 1.7,
      scatter: { col: 1, row: 1 },
    },
    {
      name: "ORBIT",
      color: "#40dce3",
      pattern: 2,
      release: 3.5,
      scatter: { col: 17, row: 21 },
    },
    {
      name: "RIFT",
      color: "#ffad42",
      pattern: 3,
      release: 5.2,
      scatter: { col: 1, row: 21 },
    },
  ]);

  const STATE = Object.freeze({
    READY: "ready",
    PLAYING: "playing",
    PAUSED: "paused",
    LIFE_LOST: "life-lost",
    LEVEL_CLEAR: "level-clear",
    GAME_OVER: "game-over",
  });

  const baseMap = MAP_LAYOUT.map((row) => [...row].map((cell) => CHAR_TO_TILE[cell]));
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  let levelMap = [];
  let player;
  let ghosts = [];
  let score = 0;
  let highScore = loadHighScore();
  let level = 1;
  let lives = 3;
  let remainingCollectibles = 0;
  let initialCollectibles = 0;
  let frightenedTimer = 0;
  let ghostChain = 0;
  let transitionTimer = 0;
  let gameState = STATE.READY;
  let renderClock = 0;
  let canvasScale = 1;
  let accumulator = 0;
  let previousFrameTime = performance.now();
  let scorePopups = [];
  let fruit = createFruitState();

  validateMap();
  configureCanvas();
  startFreshGame(false);
  requestAnimationFrame(gameLoop);

  function createFruitState() {
    return {
      active: false,
      timer: 0,
      value: 100,
      spawned: [false, false],
    };
  }

  function parseScore(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function loadHighScore() {
    try {
      return parseScore(window.localStorage.getItem(STORAGE_KEY));
    } catch (_error) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(highScore));
    } catch (_error) {
      // file:// 또는 개인정보 보호 모드에서 저장이 막혀도 게임은 계속 진행한다.
    }
  }

  function validateMap() {
    if (MAP_LAYOUT.length !== ROWS || MAP_LAYOUT.some((row) => row.length !== COLS)) {
      throw new Error(`Tile map must be exactly ${COLS} × ${ROWS}.`);
    }

    let powerCount = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = baseMap[row][col];
        if (tile === undefined) {
          throw new Error(`Unknown tile at ${col}, ${row}.`);
        }
        if (tile === TILE.POWER) powerCount += 1;
      }
    }

    if (powerCount !== 4) {
      throw new Error("The map must contain exactly four energy balls.");
    }

    const requiredOpenTiles = [PLAYER_SPAWN, FRUIT_SPAWN, ...GHOST_SPAWNS];
    for (const point of requiredOpenTiles) {
      if (baseMap[point.row][point.col] === TILE.WALL) {
        throw new Error(`Spawn point ${point.col}, ${point.row} is inside a wall.`);
      }
    }

    // 플레이어 시작점에서 문을 통과하지 않고 모든 수집물에 닿을 수 있는지 검사한다.
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const queue = [{ ...PLAYER_SPAWN }];
    visited[PLAYER_SPAWN.row][PLAYER_SPAWN.col] = true;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const direction of DIRECTIONS) {
        const neighbor = getNeighbor(current.col, current.row, direction);
        if (!neighbor) continue;
        const tile = baseMap[neighbor.row][neighbor.normalizedCol];
        if (tile === TILE.WALL || tile === TILE.DOOR) continue;
        if (visited[neighbor.row][neighbor.normalizedCol]) continue;
        visited[neighbor.row][neighbor.normalizedCol] = true;
        queue.push({ col: neighbor.normalizedCol, row: neighbor.row });
      }
    }

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = baseMap[row][col];
        const mustReach = tile === TILE.DOT || tile === TILE.POWER;
        if (mustReach && !visited[row][col]) {
          throw new Error(`Collectible at ${col}, ${row} is unreachable.`);
        }
      }
    }

    if (!visited[FRUIT_SPAWN.row][FRUIT_SPAWN.col]) {
      throw new Error("Fruit spawn is unreachable.");
    }
  }

  function configureCanvas() {
    const nextScale = Math.min(window.devicePixelRatio || 1, 2);
    canvasScale = nextScale;
    canvas.width = Math.round(BOARD_WIDTH * canvasScale);
    canvas.height = Math.round(BOARD_HEIGHT * canvasScale);
  }

  function cloneMap() {
    return baseMap.map((row) => [...row]);
  }

  function countCollectibles(map) {
    return map.reduce(
      (total, row) => total + row.filter((tile) => tile === TILE.DOT || tile === TILE.POWER).length,
      0,
    );
  }

  function makeMover(spawn, direction) {
    return {
      col: spawn.col,
      row: spawn.row,
      targetCol: null,
      targetRow: null,
      progress: 0,
      dir: direction,
    };
  }

  function resetEntities() {
    player = {
      ...makeMover(PLAYER_SPAWN, LEFT),
      queuedDir: LEFT,
      isGhost: false,
    };

    ghosts = GHOST_CONFIG.map((config, index) => ({
      ...makeMover(GHOST_SPAWNS[index], UP),
      isGhost: true,
      index,
      config,
      mode: "waiting",
      releaseTimer: config.release,
      eatenInCurrentEnergy: false,
    }));
  }

  function setupLevel() {
    levelMap = cloneMap();
    remainingCollectibles = countCollectibles(levelMap);
    initialCollectibles = remainingCollectibles;
    frightenedTimer = 0;
    ghostChain = 0;
    scorePopups = [];
    fruit = createFruitState();
    fruit.value = Math.min(500, 100 + (level - 1) * 50);
    resetEntities();
    updateHud();
  }

  function startFreshGame(playImmediately) {
    score = 0;
    level = 1;
    lives = 3;
    transitionTimer = 0;
    setupLevel();

    if (playImmediately) {
      gameState = STATE.PLAYING;
      hideOverlay();
      announce("새 게임을 시작합니다.");
      focusCanvas();
    } else {
      gameState = STATE.READY;
      showOverlay(
        "NEON MAZE // READY",
        "PRESS ENTER TO START",
        "ARROW KEYS / WASD",
        "START",
      );
    }

    syncPauseButton();
  }

  function startGame() {
    if (gameState !== STATE.READY) return;
    gameState = STATE.PLAYING;
    hideOverlay();
    syncPauseButton();
    announce("게임 시작");
    focusCanvas();
  }

  function restartGame() {
    startFreshGame(true);
  }

  function togglePause() {
    if (gameState === STATE.PLAYING) {
      gameState = STATE.PAUSED;
      showOverlay("SYSTEM // HOLD", "PAUSED", "P 키 또는 버튼으로 계속", "RESUME", true);
      announce("게임 일시정지");
    } else if (gameState === STATE.PAUSED) {
      gameState = STATE.PLAYING;
      hideOverlay();
      announce("게임 계속");
      focusCanvas();
    }
    syncPauseButton();
  }

  function triggerLevelClear() {
    if (gameState !== STATE.PLAYING) return;
    gameState = STATE.LEVEL_CLEAR;
    transitionTimer = 1.65;
    frightenedTimer = 0;
    fruit.active = false;
    showOverlay("SECTOR COMPLETE", "STAGE CLEAR", `LEVEL ${String(level).padStart(2, "0")} COMPLETE`);
    announce(`레벨 ${level} 클리어`);
    syncPauseButton();
  }

  function advanceToNextLevel() {
    level += 1;
    setupLevel();
    gameState = STATE.PLAYING;
    hideOverlay();
    announce(`레벨 ${level} 시작`);
    syncPauseButton();
  }

  function loseLife() {
    if (gameState !== STATE.PLAYING) return;

    lives = Math.max(0, lives - 1);
    frightenedTimer = 0;
    ghostChain = 0;
    fruit.active = false;
    scorePopups = [];
    updateHud();

    if (lives === 0) {
      gameState = STATE.GAME_OVER;
      showOverlay(
        "RUN TERMINATED",
        "GAME OVER",
        `FINAL SCORE ${formatScore(score)} · PRESS R`,
        "PLAY AGAIN",
        true,
      );
      announce(`게임 오버. 최종 점수 ${score}점`);
    } else {
      resetEntities();
      gameState = STATE.LIFE_LOST;
      transitionTimer = 1.35;
      showOverlay("SIGNAL LOST", "READY!", `${lives} ${lives === 1 ? "LIFE" : "LIVES"} LEFT`);
      announce(`목숨을 잃었습니다. 남은 목숨 ${lives}개`);
    }

    syncPauseButton();
  }

  function resumeAfterLifeLost() {
    gameState = STATE.PLAYING;
    hideOverlay();
    announce("다시 시작");
  }

  function showOverlay(kicker, title, detail, actionLabel = "", focusAction = false) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayDetail.textContent = detail;
    overlayAction.hidden = !actionLabel;
    if (actionLabel) overlayAction.textContent = actionLabel;
    overlay.hidden = false;
    if (actionLabel && focusAction) {
      try {
        overlayAction.focus({ preventScroll: true });
      } catch (_error) {
        overlayAction.focus();
      }
    }
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function announce(message) {
    announcement.textContent = "";
    window.setTimeout(() => {
      announcement.textContent = message;
    }, 10);
  }

  function focusCanvas() {
    try {
      canvas.focus({ preventScroll: true });
    } catch (_error) {
      canvas.focus();
    }
  }

  function syncPauseButton() {
    const paused = gameState === STATE.PAUSED;
    pauseButton.textContent = paused ? "RESUME" : "PAUSE";
    pauseButton.setAttribute("aria-label", paused ? "게임 계속하기" : "게임 일시정지");
  }

  function formatScore(value) {
    return String(value).padStart(6, "0");
  }

  function updateHud() {
    scoreValue.textContent = formatScore(score);
    highScoreValue.textContent = formatScore(highScore);
    levelValue.textContent = String(level).padStart(2, "0");

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < lives; index += 1) {
      const icon = document.createElement("span");
      icon.className = "life-icon";
      icon.setAttribute("aria-hidden", "true");
      fragment.append(icon);
    }
    livesValue.replaceChildren(fragment);
    livesValue.setAttribute("aria-label", `남은 목숨 ${lives}개`);
  }

  function addScore(points) {
    score += points;
    if (score > highScore) {
      highScore = score;
      saveHighScore();
    }
    updateHud();
  }

  function oppositeOf(direction) {
    if (direction === UP) return DOWN;
    if (direction === DOWN) return UP;
    if (direction === LEFT) return RIGHT;
    return LEFT;
  }

  function isOpposite(first, second) {
    return first.dx === -second.dx && first.dy === -second.dy;
  }

  function wrapColumn(col) {
    return ((col % COLS) + COLS) % COLS;
  }

  function getNeighbor(col, row, direction) {
    const nextRow = row + direction.dy;
    const rawCol = col + direction.dx;

    if (nextRow < 0 || nextRow >= ROWS) return null;

    if (rawCol < 0 || rawCol >= COLS) {
      if (row !== TUNNEL_ROW || direction.dy !== 0) return null;
      return { rawCol, normalizedCol: wrapColumn(rawCol), row: nextRow };
    }

    return { rawCol, normalizedCol: rawCol, row: nextRow };
  }

  function tileAt(col, row) {
    if (row < 0 || row >= ROWS) return TILE.WALL;
    const safeCol = row === TUNNEL_ROW ? wrapColumn(col) : col;
    if (safeCol < 0 || safeCol >= COLS) return TILE.WALL;
    return levelMap[row][safeCol];
  }

  function canGhostUseDoor(ghost) {
    return ghost.mode === "exiting" || ghost.mode === "returning";
  }

  function tileIsWalkable(tile, mover) {
    if (tile === TILE.WALL) return false;
    if (tile === TILE.DOOR) return mover.isGhost && canGhostUseDoor(mover);
    return true;
  }

  function canMove(mover, direction) {
    const neighbor = getNeighbor(mover.col, mover.row, direction);
    if (!neighbor) return false;
    return tileIsWalkable(tileAt(neighbor.normalizedCol, neighbor.row), mover);
  }

  function beginSegment(mover, direction) {
    const neighbor = getNeighbor(mover.col, mover.row, direction);
    if (!neighbor || !tileIsWalkable(tileAt(neighbor.normalizedCol, neighbor.row), mover)) return false;

    mover.dir = direction;
    mover.targetCol = neighbor.rawCol;
    mover.targetRow = neighbor.row;
    mover.progress = 0;
    return true;
  }

  // 타일과 타일 사이 진행률을 누적해 논리 이동과 화면 보간을 분리한다.
  function advanceMover(mover, speed, delta, chooseDirection, onArrival) {
    let distanceLeft = speed * delta;
    let safety = 0;

    while (distanceLeft > 0.000001 && safety < 10) {
      safety += 1;

      if (mover.targetCol === null) {
        const nextDirection = chooseDirection(mover);
        if (!nextDirection || !beginSegment(mover, nextDirection)) return;
      }

      const distanceToTarget = 1 - mover.progress;
      if (distanceLeft < distanceToTarget) {
        mover.progress += distanceLeft;
        return;
      }

      distanceLeft -= distanceToTarget;
      mover.col = wrapColumn(mover.targetCol);
      mover.row = mover.targetRow;
      mover.targetCol = null;
      mover.targetRow = null;
      mover.progress = 0;

      if (onArrival && onArrival(mover) === false) return;
    }
  }

  function reverseMover(mover, direction) {
    if (mover.targetCol === null) {
      mover.dir = direction;
      return;
    }

    // 터널 바깥의 가상 타일에서는 다음 중심점까지 이동한 뒤 반전한다.
    if (mover.targetCol < 0 || mover.targetCol >= COLS) return;

    const oldCol = mover.col;
    const oldRow = mover.row;
    mover.col = mover.targetCol;
    mover.row = mover.targetRow;
    mover.targetCol = oldCol;
    mover.targetRow = oldRow;
    mover.progress = 1 - mover.progress;
    mover.dir = direction;
  }

  function queuePlayerDirection(direction) {
    player.queuedDir = direction;
    if (
      gameState === STATE.PLAYING &&
      player.targetCol !== null &&
      isOpposite(direction, player.dir)
    ) {
      reverseMover(player, direction);
    }
  }

  function choosePlayerDirection() {
    if (player.queuedDir && canMove(player, player.queuedDir)) return player.queuedDir;
    if (player.dir && canMove(player, player.dir)) return player.dir;
    return null;
  }

  function getEntityTile(mover) {
    if (mover.targetCol !== null && mover.progress >= 0.5) {
      return { col: wrapColumn(mover.targetCol), row: mover.targetRow };
    }
    return { col: mover.col, row: mover.row };
  }

  function getEntityPosition(mover) {
    if (mover.targetCol === null) {
      return {
        x: (mover.col + 0.5) * TILE_SIZE,
        y: (mover.row + 0.5) * TILE_SIZE,
      };
    }

    return {
      x: (mover.col + 0.5 + (mover.targetCol - mover.col) * mover.progress) * TILE_SIZE,
      y: (mover.row + 0.5 + (mover.targetRow - mover.row) * mover.progress) * TILE_SIZE,
    };
  }

  function getGhostTarget(ghost) {
    const playerTile = getEntityTile(player);

    if (ghost.index === 0) {
      // BEAM: 플레이어의 현재 타일을 직접 추적한다.
      return playerTile;
    }

    if (ghost.index === 1) {
      // VEX: 플레이어가 진행하는 방향의 네 칸 앞을 예측한다.
      return projectTile(playerTile, player.dir, 4);
    }

    if (ghost.index === 2) {
      // ORBIT: 플레이어 앞 지점과 첫 번째 유령의 위치를 조합한 벡터를 노린다.
      const beamTile = getEntityTile(ghosts[0]);
      const ahead = projectTile(playerTile, player.dir, 2);
      let vectorX = ahead.col - beamTile.col;
      if (ahead.row === TUNNEL_ROW && beamTile.row === TUNNEL_ROW && Math.abs(vectorX) > COLS / 2) {
        vectorX -= Math.sign(vectorX) * COLS;
      }
      const target = {
        col: ahead.col + vectorX,
        row: ahead.row + (ahead.row - beamTile.row),
      };
      if (target.row === TUNNEL_ROW) target.col = wrapColumn(target.col);
      return target;
    }

    // RIFT: 멀리서는 추적하지만 여섯 타일 안으로 접근하면 자기 모서리로 흩어진다.
    const ghostTile = getEntityTile(ghost);
    let horizontalDistance = Math.abs(ghostTile.col - playerTile.col);
    if (ghostTile.row === TUNNEL_ROW && playerTile.row === TUNNEL_ROW) {
      horizontalDistance = Math.min(horizontalDistance, COLS - horizontalDistance);
    }
    const distance = Math.hypot(horizontalDistance, ghostTile.row - playerTile.row);
    return distance < 6 ? ghost.config.scatter : playerTile;
  }

  function projectTile(origin, direction, steps) {
    const projected = {
      col: origin.col + direction.dx * steps,
      row: origin.row + direction.dy * steps,
    };
    if (origin.row === TUNNEL_ROW && direction.dy === 0) {
      projected.col = wrapColumn(((projected.col % COLS) + COLS) % COLS);
    }
    return projected;
  }

  function doorAllowedForMode(mode) {
    return mode === "returning" || mode === "exiting";
  }

  function walkableForGhostPath(tile, allowDoor) {
    return tile !== TILE.WALL && (tile !== TILE.DOOR || allowDoor);
  }

  function findNearestReachablePathTile(target, ghost, allowDoor) {
    let best = { col: ghost.col, row: ghost.row };
    let bestDistance = Number.POSITIVE_INFINITY;
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const queue = [{ col: ghost.col, row: ghost.row }];
    visited[ghost.row][ghost.col] = true;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const distance = Math.abs(current.col - target.col) + Math.abs(current.row - target.row);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = current;
      }

      for (const direction of DIRECTIONS) {
        const neighbor = getNeighbor(current.col, current.row, direction);
        if (!neighbor) continue;
        const col = neighbor.normalizedCol;
        const row = neighbor.row;
        if (visited[row][col] || !walkableForGhostPath(levelMap[row][col], allowDoor)) continue;
        visited[row][col] = true;
        queue.push({ col, row });
      }
    }

    return best;
  }

  // 목표점에서 역방향 BFS 거리표를 만들어 막힌 벽 너머의 가짜 최단거리 선택을 방지한다.
  function createDistanceMap(target, ghost) {
    const allowDoor = doorAllowedForMode(ghost.mode);
    const goal = findNearestReachablePathTile(target, ghost, allowDoor);
    const distances = Array.from({ length: ROWS }, () => Array(COLS).fill(Number.POSITIVE_INFINITY));
    if (!goal) return distances;

    const queue = [goal];
    distances[goal.row][goal.col] = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const nextDistance = distances[current.row][current.col] + 1;

      for (const direction of DIRECTIONS) {
        const neighbor = getNeighbor(current.col, current.row, direction);
        if (!neighbor) continue;
        const col = neighbor.normalizedCol;
        const row = neighbor.row;
        if (!walkableForGhostPath(levelMap[row][col], allowDoor)) continue;
        if (distances[row][col] <= nextDistance) continue;
        distances[row][col] = nextDistance;
        queue.push({ col, row });
      }
    }

    return distances;
  }

  function chooseGhostDirection(ghost) {
    let candidates = DIRECTIONS.filter((direction) => canMove(ghost, direction));
    if (candidates.length === 0) return null;

    const reverse = oppositeOf(ghost.dir);
    const forwardCandidates = candidates.filter((direction) => direction !== reverse);
    if (forwardCandidates.length > 0) candidates = forwardCandidates;

    if (isGhostFrightened(ghost)) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const target =
      ghost.mode === "returning"
        ? HOME_TARGET
        : ghost.mode === "exiting"
          ? HOME_EXIT
          : getGhostTarget(ghost);
    const distances = createDistanceMap(target, ghost);

    let chosen = candidates[0];
    let shortest = Number.POSITIVE_INFINITY;
    for (const direction of candidates) {
      const neighbor = getNeighbor(ghost.col, ghost.row, direction);
      if (!neighbor) continue;
      const distance = distances[neighbor.row][neighbor.normalizedCol];
      if (distance < shortest) {
        shortest = distance;
        chosen = direction;
      }
    }

    return chosen;
  }

  function ghostSpeed(ghost) {
    if (ghost.mode === "returning") return 7.1;
    if (isGhostFrightened(ghost)) return 3.35;
    // 상한에서 갑자기 멈추지 않고 플레이어 속도 아래로 점차 수렴한다.
    return 4.05 + 1.32 * (1 - Math.exp(-(level - 1) * 0.16)) + ghost.index * 0.035;
  }

  function isGhostFrightened(ghost) {
    return frightenedTimer > 0 && ghost.mode !== "returning" && !ghost.eatenInCurrentEnergy;
  }

  function onGhostArrival(ghost) {
    if (ghost.mode === "returning" && ghost.col === HOME_TARGET.col && ghost.row === HOME_TARGET.row) {
      ghost.mode = "waiting";
      ghost.releaseTimer = 1.25;
      ghost.dir = UP;
      return false;
    }

    if (ghost.mode === "exiting" && ghost.col === HOME_EXIT.col && ghost.row === HOME_EXIT.row) {
      ghost.mode = "normal";
    }

    return true;
  }

  function updateGhost(ghost, delta) {
    if (ghost.mode === "waiting") {
      ghost.releaseTimer -= delta;
      if (ghost.releaseTimer > 0) return;
      ghost.mode = "exiting";
      ghost.releaseTimer = 0;
    }

    advanceMover(
      ghost,
      ghostSpeed(ghost),
      delta,
      () => chooseGhostDirection(ghost),
      () => onGhostArrival(ghost),
    );
  }

  function collectPlayerTile() {
    const tile = levelMap[player.row][player.col];
    if (tile !== TILE.DOT && tile !== TILE.POWER) return true;

    levelMap[player.row][player.col] = TILE.PATH;
    remainingCollectibles -= 1;

    if (tile === TILE.DOT) {
      addScore(10);
    } else {
      addScore(50);
      activateEnergyMode();
    }

    maybeSpawnFruit();
    if (remainingCollectibles === 0) {
      triggerLevelClear();
      return false;
    }

    return true;
  }

  function activateEnergyMode() {
    frightenedTimer = Math.max(4.1, 7.2 - (level - 1) * 0.32);
    ghostChain = 0;

    for (const ghost of ghosts) {
      // 귀환 중인 유령은 새 효과의 대상이 아니며, 나머지는 이번 연쇄에서 한 번만 잡힌다.
      ghost.eatenInCurrentEnergy = ghost.mode === "returning";
      if (ghost.mode === "returning" || ghost.mode === "waiting") continue;
      reverseMover(ghost, oppositeOf(ghost.dir));
    }

    announce("에너지 모드. 파란 추격자를 잡을 수 있습니다.");
  }

  function maybeSpawnFruit() {
    if (fruit.active || initialCollectibles <= 0) return;
    const remainingRatio = remainingCollectibles / initialCollectibles;
    const thresholds = [0.67, 0.31];

    for (let index = 0; index < thresholds.length; index += 1) {
      if (!fruit.spawned[index] && remainingRatio <= thresholds[index]) {
        fruit.spawned[index] = true;
        fruit.active = true;
        fruit.timer = 9;
        announce(`프리즘 과일 등장. ${fruit.value}점`);
        break;
      }
    }
  }

  function wrappedHorizontalDistance(firstX, secondX) {
    let distance = Math.abs(firstX - secondX);
    if (distance > BOARD_WIDTH / 2) distance = BOARD_WIDTH - distance;
    return Math.abs(distance);
  }

  function entitiesCollide(first, second, radius = TILE_SIZE * 0.58) {
    const firstPosition = getEntityPosition(first);
    const secondPosition = getEntityPosition(second);
    const dx = wrappedHorizontalDistance(firstPosition.x, secondPosition.x);
    const dy = Math.abs(firstPosition.y - secondPosition.y);
    return dx * dx + dy * dy <= radius * radius;
  }

  function checkFruitCollision() {
    if (!fruit.active) return;
    const playerPosition = getEntityPosition(player);
    const fruitX = (FRUIT_SPAWN.col + 0.5) * TILE_SIZE;
    const fruitY = (FRUIT_SPAWN.row + 0.5) * TILE_SIZE;
    const dx = wrappedHorizontalDistance(playerPosition.x, fruitX);
    const dy = playerPosition.y - fruitY;

    if (dx * dx + dy * dy <= (TILE_SIZE * 0.64) ** 2) {
      fruit.active = false;
      addScore(fruit.value);
      addScorePopup(fruitX, fruitY, fruit.value, "#a8ff5b");
      announce(`프리즘 과일 ${fruit.value}점`);
    }
  }

  function checkGhostCollisions() {
    for (const ghost of ghosts) {
      if (ghost.mode === "waiting" || ghost.mode === "returning") continue;
      if (!entitiesCollide(player, ghost)) continue;

      if (isGhostFrightened(ghost)) {
        const chainScores = [200, 400, 800, 1600];
        const points = chainScores[Math.min(ghostChain, chainScores.length - 1)];
        ghostChain = Math.min(ghostChain + 1, chainScores.length);
        addScore(points);
        const position = getEntityPosition(ghost);
        addScorePopup(position.x, position.y, points, "#ffffff");
        const nearestTile = getEntityTile(ghost);
        ghost.col = nearestTile.col;
        ghost.row = nearestTile.row;
        ghost.eatenInCurrentEnergy = true;
        ghost.mode = "returning";
        ghost.targetCol = null;
        ghost.targetRow = null;
        ghost.progress = 0;
        announce(`${ghost.config.name} 포착. ${points}점`);
      } else {
        loseLife();
        return;
      }
    }
  }

  function addScorePopup(x, y, points, color) {
    scorePopups.push({ x, y, points, color, life: 0.9 });
  }

  function updateScorePopups(delta) {
    for (const popup of scorePopups) popup.life -= delta;
    scorePopups = scorePopups.filter((popup) => popup.life > 0);
  }

  function updatePlaying(delta) {
    if (frightenedTimer > 0) {
      frightenedTimer = Math.max(0, frightenedTimer - delta);
      if (frightenedTimer === 0) ghostChain = 0;
    }

    if (fruit.active) {
      fruit.timer -= delta;
      if (fruit.timer <= 0) fruit.active = false;
    } else {
      maybeSpawnFruit();
    }

    advanceMover(player, PLAYER_SPEED, delta, choosePlayerDirection, collectPlayerTile);
    if (gameState !== STATE.PLAYING) return;

    checkFruitCollision();
    for (const ghost of ghosts) updateGhost(ghost, delta);
    checkGhostCollisions();
    updateScorePopups(delta);
  }

  function updateTransitions(delta) {
    transitionTimer = Math.max(0, transitionTimer - delta);
    if (transitionTimer > 0) return;

    if (gameState === STATE.LIFE_LOST) {
      resumeAfterLifeLost();
    } else if (gameState === STATE.LEVEL_CLEAR) {
      advanceToNextLevel();
    }
  }

  function update(delta) {
    if (gameState === STATE.PLAYING) {
      updatePlaying(delta);
    } else if (gameState === STATE.LIFE_LOST || gameState === STATE.LEVEL_CLEAR) {
      updateTransitions(delta);
    }
  }

  function gameLoop(frameTime) {
    const elapsed = Math.min(MAX_FRAME_TIME, Math.max(0, (frameTime - previousFrameTime) / 1000));
    previousFrameTime = frameTime;
    renderClock = frameTime / 1000;
    accumulator += elapsed;

    while (accumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  function render() {
    context.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
    context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    context.fillStyle = "#000006";
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    drawMaze();
    if (fruit.active) drawFruit();
    drawPlayer();
    for (const ghost of ghosts) drawGhost(ghost);
    drawScorePopups();
  }

  function isWall(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return levelMap[row][col] === TILE.WALL;
  }

  function drawMaze() {
    context.save();
    context.fillStyle = "#06132e";
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (levelMap[row][col] !== TILE.WALL) continue;
        context.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    drawWallEdges(4.2, "#073d9f", 7);
    drawWallEdges(1.35, "#39b9ff", 4);
    context.restore();

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = levelMap[row][col];
        const x = (col + 0.5) * TILE_SIZE;
        const y = (row + 0.5) * TILE_SIZE;

        if (tile === TILE.DOT) {
          context.fillStyle = "#fff4c7";
          context.beginPath();
          context.arc(x, y, 2.05, 0, Math.PI * 2);
          context.fill();
        } else if (tile === TILE.POWER) {
          const pulse = reducedMotionQuery.matches ? 0 : (Math.sin(renderClock * 5.2) + 1) * 0.65;
          context.save();
          context.shadowColor = "rgba(255, 242, 180, 0.8)";
          context.shadowBlur = 7;
          context.fillStyle = "#fff2b4";
          context.beginPath();
          context.arc(x, y, 5.1 + pulse, 0, Math.PI * 2);
          context.fill();
          context.restore();
        } else if (tile === TILE.DOOR) {
          context.save();
          context.strokeStyle = "#ff75d8";
          context.lineWidth = 2.4;
          context.shadowColor = "#ff40cb";
          context.shadowBlur = 5;
          context.beginPath();
          context.moveTo(col * TILE_SIZE + 3, y);
          context.lineTo((col + 1) * TILE_SIZE - 3, y);
          context.stroke();
          context.restore();
        } else if (tile === TILE.TUNNEL) {
          drawTunnelMarker(col, y);
        }
      }
    }
  }

  function drawWallEdges(lineWidth, color, shadowBlur) {
    context.beginPath();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!isWall(col, row)) continue;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const maxX = x + TILE_SIZE;
        const maxY = y + TILE_SIZE;

        if (!isWall(col, row - 1)) {
          context.moveTo(x, y);
          context.lineTo(maxX, y);
        }
        if (!isWall(col + 1, row)) {
          context.moveTo(maxX, y);
          context.lineTo(maxX, maxY);
        }
        if (!isWall(col, row + 1)) {
          context.moveTo(maxX, maxY);
          context.lineTo(x, maxY);
        }
        if (!isWall(col - 1, row)) {
          context.moveTo(x, maxY);
          context.lineTo(x, y);
        }
      }
    }
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = shadowBlur;
    context.stroke();
  }

  function drawTunnelMarker(col, y) {
    context.save();
    context.strokeStyle = "rgba(115, 215, 255, 0.58)";
    context.lineWidth = 1.2;
    context.setLineDash([2, 3]);
    const direction = col === 0 ? -1 : 1;
    const centerX = col === 0 ? 7 : BOARD_WIDTH - 7;
    context.beginPath();
    context.moveTo(centerX - direction * 4, y - 4);
    context.lineTo(centerX, y);
    context.lineTo(centerX - direction * 4, y + 4);
    context.stroke();
    context.restore();
  }

  function drawAtTunnelCopies(position, drawer, margin = 13) {
    drawer(position.x, position.y);
    if (position.x < margin) drawer(position.x + BOARD_WIDTH, position.y);
    if (position.x > BOARD_WIDTH - margin) drawer(position.x - BOARD_WIDTH, position.y);
  }

  function drawPlayer() {
    const position = getEntityPosition(player);
    drawAtTunnelCopies(position, (x, y) => drawPlayerShape(x, y));
  }

  function drawPlayerShape(x, y) {
    const moving = player.targetCol !== null;
    const mouthWave = reducedMotionQuery.matches ? 0.28 : 0.18 + Math.abs(Math.sin(renderClock * 10)) * 0.25;
    const mouth = moving ? mouthWave : 0.19;
    const angle = player.dir.angle;

    context.save();
    context.translate(x, y);
    context.fillStyle = "#ffe33d";
    context.shadowColor = "rgba(255, 227, 61, 0.72)";
    context.shadowBlur = 7;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, 9.7, angle + mouth, angle + Math.PI * 2 - mouth);
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = "rgba(255, 255, 255, 0.7)";
    context.beginPath();
    context.arc(-2.8, -4.7, 1.35, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function traceGhostBody() {
    context.beginPath();
    context.moveTo(-9.5, 9);
    context.lineTo(-9.5, -1.5);
    context.bezierCurveTo(-9.5, -8.2, -5.3, -11, 0, -11);
    context.bezierCurveTo(5.3, -11, 9.5, -8.2, 9.5, -1.5);
    context.lineTo(9.5, 9);
    context.lineTo(5.8, 6.2);
    context.lineTo(2.5, 9.2);
    context.lineTo(-1, 6.2);
    context.lineTo(-4.5, 9.2);
    context.lineTo(-7.1, 6.4);
    context.closePath();
  }

  function drawGhost(ghost) {
    const position = getEntityPosition(ghost);
    drawAtTunnelCopies(position, (x, y) => drawGhostShape(ghost, x, y), 14);
  }

  function drawGhostShape(ghost, x, y) {
    const returning = ghost.mode === "returning";
    const frightened = isGhostFrightened(ghost);
    const warningFlash =
      frightened &&
      frightenedTimer < 2 &&
      !reducedMotionQuery.matches &&
      Math.floor(frightenedTimer * 7) % 2 === 0;
    const bodyColor = warningFlash ? "#f2f6ff" : frightened ? "#245ee8" : ghost.config.color;

    context.save();
    context.translate(x, y);

    if (!returning) {
      context.save();
      context.shadowColor = bodyColor;
      context.shadowBlur = 6;
      traceGhostBody();
      context.fillStyle = bodyColor;
      context.fill();
      context.lineWidth = frightened && reducedMotionQuery.matches ? 1.8 : 0.9;
      context.strokeStyle = frightened ? "#ffffff" : "rgba(255, 255, 255, 0.55)";
      context.stroke();
      context.restore();

      context.save();
      traceGhostBody();
      context.clip();
      drawGhostPattern(ghost.config.pattern, frightened ? "#ffffff" : "rgba(0, 0, 0, 0.72)");
      context.restore();
    }

    drawGhostEyes(ghost, returning, frightened);
    if (frightened && !returning) drawFrightenedMouth();
    if (returning) drawReturningMarker(ghost.config.pattern, ghost.config.color);
    context.restore();
  }

  function drawGhostPattern(pattern, color) {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.9;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (pattern === 0) {
      context.beginPath();
      context.moveTo(0, -10);
      context.lineTo(0, -5.7);
      context.stroke();
    } else if (pattern === 1) {
      context.beginPath();
      context.moveTo(-5.2, -8.3);
      context.lineTo(5.2, -8.3);
      context.moveTo(-4.2, -5.9);
      context.lineTo(4.2, -5.9);
      context.stroke();
    } else if (pattern === 2) {
      for (const offset of [-3.4, 0, 3.4]) {
        context.beginPath();
        context.arc(offset, -7.4, 1, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.beginPath();
      context.moveTo(-5.2, -8.4);
      context.lineTo(-2.5, -5.8);
      context.lineTo(0, -8.4);
      context.lineTo(2.5, -5.8);
      context.lineTo(5.2, -8.4);
      context.stroke();
    }
  }

  function drawGhostEyes(ghost, returning, frightened) {
    const lookX = returning ? ghost.dir.dx * 1.3 : ghost.dir.dx * 1.1;
    const lookY = returning ? ghost.dir.dy * 1.1 : ghost.dir.dy * 0.8;
    const pattern = ghost.config.pattern;
    const eyeY = frightened ? -1.7 : -2.1;

    for (const eyeX of [-3.6, 3.6]) {
      context.save();
      context.translate(eyeX, eyeY);
      context.fillStyle = "#ffffff";
      context.beginPath();

      if (pattern === 0) {
        context.arc(0, 0, 2.7, 0, Math.PI * 2);
      } else if (pattern === 1) {
        context.moveTo(-2.8, -1.3);
        context.lineTo(2.8, -0.3);
        context.lineTo(2.3, 2);
        context.lineTo(-2.3, 1.5);
        context.closePath();
      } else if (pattern === 2) {
        context.moveTo(0, -3);
        context.lineTo(2.8, 0);
        context.lineTo(0, 3);
        context.lineTo(-2.8, 0);
        context.closePath();
      } else {
        context.roundRect(-2.7, -2.5, 5.4, 5, 1);
      }

      context.fill();
      context.fillStyle = returning ? ghost.config.color : "#071a42";
      context.beginPath();
      context.arc(lookX, lookY, 1.15, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawFrightenedMouth() {
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.25;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-4.5, 4.2);
    context.lineTo(-2.7, 2.8);
    context.lineTo(-0.9, 4.2);
    context.lineTo(0.9, 2.8);
    context.lineTo(2.7, 4.2);
    context.lineTo(4.5, 2.8);
    context.stroke();
  }

  function drawReturningMarker(pattern, color) {
    context.save();
    context.translate(0, -7.3);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.3;
    if (pattern === 0) {
      context.beginPath();
      context.moveTo(0, -2);
      context.lineTo(0, 2);
      context.stroke();
    } else if (pattern === 1) {
      context.fillRect(-3, -1, 6, 2);
    } else if (pattern === 2) {
      for (const x of [-2.5, 0, 2.5]) {
        context.beginPath();
        context.arc(x, 0, 0.75, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.beginPath();
      context.moveTo(-3, 1.5);
      context.lineTo(0, -1.5);
      context.lineTo(3, 1.5);
      context.stroke();
    }
    context.restore();
  }

  function drawFruit() {
    const x = (FRUIT_SPAWN.col + 0.5) * TILE_SIZE;
    const y = (FRUIT_SPAWN.row + 0.5) * TILE_SIZE;
    const pulse = reducedMotionQuery.matches ? 1 : 1 + Math.sin(renderClock * 4) * 0.06;

    context.save();
    context.translate(x, y);
    context.scale(pulse, pulse);
    context.shadowColor = "rgba(168, 255, 91, 0.8)";
    context.shadowBlur = 8;
    context.fillStyle = "#a8ff5b";
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
      const px = Math.cos(angle) * 7;
      const py = Math.sin(angle) * 7;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = "#ffcc39";
    context.beginPath();
    context.arc(0, 0, 2.3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, -7);
    context.quadraticCurveTo(3, -11, 6, -9);
    context.stroke();
    context.restore();
  }

  function drawScorePopups() {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 10px 'Courier New', monospace";
    for (const popup of scorePopups) {
      const alpha = Math.min(1, popup.life * 2);
      context.globalAlpha = alpha;
      context.fillStyle = popup.color;
      context.shadowColor = popup.color;
      context.shadowBlur = 4;
      context.fillText(String(popup.points), popup.x, popup.y - (1 - popup.life) * 10);
    }
    context.restore();
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const direction =
      event.key === "ArrowUp" || key === "w"
        ? UP
        : event.key === "ArrowLeft" || key === "a"
          ? LEFT
          : event.key === "ArrowDown" || key === "s"
            ? DOWN
            : event.key === "ArrowRight" || key === "d"
              ? RIGHT
              : null;

    if (direction) {
      event.preventDefault();
      queuePlayerDirection(direction);
      return;
    }

    if (event.repeat) return;

    if (event.key === "Enter") {
      if (gameState === STATE.READY) {
        event.preventDefault();
        startGame();
      } else if (gameState === STATE.GAME_OVER) {
        event.preventDefault();
        restartGame();
      }
    } else if (key === "p") {
      event.preventDefault();
      togglePause();
    } else if (key === "r") {
      event.preventDefault();
      restartGame();
    }
  }

  function handleOverlayAction() {
    if (gameState === STATE.READY) startGame();
    else if (gameState === STATE.PAUSED) togglePause();
    else if (gameState === STATE.GAME_OVER) restartGame();
  }

  function handleDirectionPointer(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const direction = DIRECTION_BY_NAME[button.dataset.direction];
    if (!direction) return;

    if (button.setPointerCapture && event.pointerId !== undefined) {
      button.setPointerCapture(event.pointerId);
    }
    button.classList.add("is-pressed");
    queuePlayerDirection(direction);
  }

  function releaseDirectionButton(event) {
    event.currentTarget.classList.remove("is-pressed");
  }

  function handleDirectionClick(event) {
    // 실제 포인터 클릭은 pointerdown에서 처리한다. detail 0은 키보드/보조기술의 합성 클릭이다.
    if (event.detail !== 0) return;
    const direction = DIRECTION_BY_NAME[event.currentTarget.dataset.direction];
    if (direction) queuePlayerDirection(direction);
  }

  window.addEventListener("resize", () => {
    const nextScale = Math.min(window.devicePixelRatio || 1, 2);
    if (nextScale !== canvasScale) configureCanvas();
  });
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState === STATE.PLAYING) togglePause();
  });
  overlayAction.addEventListener("click", handleOverlayAction);
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", restartGame);

  for (const button of directionButtons) {
    button.addEventListener("pointerdown", handleDirectionPointer, { passive: false });
    button.addEventListener("click", handleDirectionClick);
    button.addEventListener("pointerup", releaseDirectionButton);
    button.addEventListener("pointercancel", releaseDirectionButton);
    button.addEventListener("lostpointercapture", releaseDirectionButton);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  // 자동화 점검에서 읽기만 가능한 최소 상태 스냅샷을 제공한다.
  Object.defineProperty(window, "neonMazeStatus", {
    configurable: false,
    enumerable: false,
    value: () => ({
      state: gameState,
      score,
      highScore,
      level,
      lives,
      remainingCollectibles,
      frightened: frightenedTimer > 0,
      fruitActive: fruit.active,
      ghostModes: ghosts.map((ghost) => ghost.mode),
      playerTile: getEntityTile(player),
    }),
  });
})();
