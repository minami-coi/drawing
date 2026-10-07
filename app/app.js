(() => {
  const $ = (selector) => document.querySelector(selector);
  const screens = [...document.querySelectorAll('.screen')];
  const colors = ['#24292b', '#ee7652', '#f2c74e', '#8b9e72', '#7196a3', '#9a7db0', '#dc8798', '#8b6047', '#f3a64d', '#5e779e', '#b8b4a8', '#ffffff'];
  const palette = $('#palette');
  const canvas = $('#drawing-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const resultCanvas = $('#result-canvas');
  const resultCtx = resultCanvas.getContext('2d');
  let topicNames = [];
  let topicName = '';
  let topicImage = new Image();
  let selectedColor = colors[0];
  let brushSize = 3;
  let erasing = false;
  let drawing = false;
  let remaining = 30;
  let timerId = null;
  let memoryId = null;
  let strokesMade = false;

  colors.forEach((color, index) => {
    const button = document.createElement('button');
    button.className = `color-button${index === 0 ? ' selected' : ''}`;
    button.type = 'button';
    button.style.background = color;
    button.setAttribute('aria-label', `色 ${index + 1}`);
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.addEventListener('click', () => {
      selectedColor = color;
      erasing = false;
      $('#eraser-button').classList.remove('selected');
      $('#eraser-button').setAttribute('aria-pressed', 'false');
      palette.querySelectorAll('.color-button').forEach((item) => {
        item.classList.toggle('selected', item === button);
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
    });
    palette.append(button);
  });

  function showScreen(name) {
    screens.forEach((screen) => {
      const active = screen.id === name;
      screen.hidden = !active;
      screen.classList.toggle('active', active);
    });
  }

  async function loadTopics() {
    try {
      const response = await fetch('topics.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('topics.json could not be loaded');
      const names = await response.json();
      if (!Array.isArray(names) || !names.length || names.some((name) => typeof name !== 'string')) throw new Error('topics.json must contain filenames');
      topicNames = names;
    } catch (error) {
      console.error(error);
      $('#start-button').disabled = true;
      $('#start-button').querySelector('span').textContent = '題材を読み込めません';
    }
  }

  function chooseTopic() {
    return new Promise((resolve, reject) => {
      topicName = topicNames[Math.floor(Math.random() * topicNames.length)];
      const image = new Image();
      image.onload = () => { topicImage = image; resolve(); };
      image.onerror = () => reject(new Error(`画像を読み込めません: ${topicName}`));
      image.src = `images/${encodeURIComponent(topicName)}`;
    });
  }

  function clearCanvas() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    strokesMade = false;
    $('#canvas-hint').style.opacity = '1';
  }

  function beginGame() {
    if (!topicNames.length) return;
    $('#start-button').disabled = true;
    chooseTopic().then(() => {
      $('#topic-image').src = topicImage.src;
      $('#memory-count').innerHTML = '05<span>秒</span>';
      $('#memory-progress').style.transition = 'none';
      $('#memory-progress').style.transform = 'scaleX(1)';
      showScreen('memory');
      requestAnimationFrame(() => {
        $('#memory-progress').style.transition = 'transform 5s linear';
        $('#memory-progress').style.transform = 'scaleX(0)';
      });
      let seconds = 5;
      memoryId = setInterval(() => {
        seconds -= 1;
        $('#memory-count').innerHTML = `${String(seconds).padStart(2, '0')}<span>秒</span>`;
        if (seconds <= 0) {
          clearInterval(memoryId);
          startDrawing();
        }
      }, 1000);
    }).catch((error) => {
      console.error(error);
      $('#start-button').querySelector('span').textContent = '画像を読み込めません';
      $('#start-button').disabled = false;
    });
  }

  function startDrawing() {
    showScreen('draw');
    clearCanvas();
    remaining = 30;
    updateTimer();
    const startedAt = Date.now();
    timerId = setInterval(() => {
      remaining = Math.max(0, 30 - Math.floor((Date.now() - startedAt) / 1000));
      updateTimer();
      if (remaining <= 0) {
        clearInterval(timerId);
        finishGame();
      }
    }, 150);
  }

  function updateTimer() {
    $('#time-count').innerHTML = `${String(remaining).padStart(2, '0')}<span>秒</span>`;
    $('#draw-timer').classList.toggle('urgent', remaining <= 7);
  }

  function finishGame() {
    drawing = false;
    canvas.style.pointerEvents = 'none';
    resultCanvas.width = 512;
    resultCanvas.height = 512;
    resultCtx.fillStyle = '#fff';
    resultCtx.fillRect(0, 0, 512, 512);
    resultCtx.drawImage(canvas, 0, 0, 512, 512);
    $('#result-topic').src = topicImage.src;
    showScreen('result');
    const score = calculateScore();
    $('#score-value').textContent = score;
    $('#score-meter-fill').style.width = `${score}%`;
    $('#score-message').textContent = score >= 75 ? 'すごい！記憶がしっかり残ってる' : score >= 45 ? '形や色がちゃんと思い出せてる' : score >= 20 ? '記憶をたどって描いたね' : 'チャレンジしたことがすばらしい！';
  }

  function getContent(imageData) {
    const { data, width, height } = imageData;
    const mask = new Uint8Array(width * height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    const bins = new Float32Array(12);
    let colored = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const isInk = a > 30 && (Math.min(r, g, b) < 222 || Math.max(r, g, b) - Math.min(r, g, b) > 30);
      if (!isInk) continue;
      const pos = y * width + x;
      mask[pos] = 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 35) {
        const hue = rgbHue(r, g, b);
        bins[Math.floor(hue / 30) % 12] += 1;
        colored += 1;
      }
    }
    if (maxX < 0) return { mask, bounds: null, bins };
    if (colored) for (let i = 0; i < bins.length; i++) bins[i] /= colored;
    return { mask, bounds: { minX, minY, maxX, maxY }, bins };
  }

  function rgbHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
    }
    return (hue * 60 + 360) % 360;
  }

  function calculateScore() {
    if (!strokesMade) return 0;
    const source = document.createElement('canvas');
    source.width = source.height = 128;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(topicImage, 0, 0, 128, 128);
    const sketch = document.createElement('canvas');
    sketch.width = sketch.height = 128;
    sketch.getContext('2d').drawImage(canvas, 0, 0, 128, 128);
    const targetFeatures = getContent(sourceContext.getImageData(0, 0, 128, 128));
    const sketchFeatures = getContent(sketch.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 128, 128));
    if (!targetFeatures.bounds || !sketchFeatures.bounds) return 0;

    // Align each foreground to its own bounding box before comparing a coarse shape grid.
    // This rewards the subject and its proportions while allowing imperfect placement.
    const shape = (features) => {
      const b = features.bounds, grid = new Float32Array(20 * 20);
      const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
      for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) if (features.mask[y * 128 + x]) {
        const gx = Math.min(19, Math.floor((x - b.minX) / bw * 20));
        const gy = Math.min(19, Math.floor((y - b.minY) / bh * 20));
        grid[gy * 20 + gx] = 1;
      }
      return grid;
    };
    const targetShape = shape(targetFeatures), sketchShape = shape(sketchFeatures);
    let intersection = 0, union = 0;
    for (let i = 0; i < targetShape.length; i++) {
      if (targetShape[i] || sketchShape[i]) union++;
      if (targetShape[i] && sketchShape[i]) intersection++;
    }
    const shapeScore = union ? intersection / union : 0;
    let colorDistance = 0;
    for (let i = 0; i < targetFeatures.bins.length; i++) colorDistance += Math.abs(targetFeatures.bins[i] - sketchFeatures.bins[i]);
    const colorScore = 1 - Math.min(1, colorDistance / 2);
    const tb = targetFeatures.bounds, sb = sketchFeatures.bounds;
    const aspectT = (tb.maxX - tb.minX + 1) / (tb.maxY - tb.minY + 1);
    const aspectS = (sb.maxX - sb.minX + 1) / (sb.maxY - sb.minY + 1);
    const proportionScore = Math.exp(-Math.abs(Math.log(aspectT / aspectS)));
    const inkRatio = sketchFeatures.mask.reduce((sum, value) => sum + value, 0) / (128 * 128);
    const completeness = Math.min(1, inkRatio / .018);
    const similarity = (shapeScore * .66 + colorScore * .23 + proportionScore * .11) * (0.65 + completeness * 0.35);

    // Expand differences around an average match instead of compressing every drawing
    // into the middle of the scale. A raw similarity of .5 maps to 50 points.
    return Math.max(0, Math.min(100, Math.round((similarity - 0.5) * 180 + 50)));
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (remaining <= 0) return;
    event.preventDefault();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x + .01, point.y + .01);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize * 2;
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = selectedColor; ctx.stroke();
    if (!erasing) strokesMade = true;
    $('#canvas-hint').style.opacity = '0';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    ctx.lineTo(point.x, point.y); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize * 2;
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'; ctx.strokeStyle = selectedColor; ctx.stroke();
  });
  const stopDrawing = () => { drawing = false; ctx.beginPath(); };
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('lostpointercapture', stopDrawing);

  document.querySelectorAll('.brush-button').forEach((button) => button.addEventListener('click', () => {
    brushSize = Number(button.dataset.size);
    document.querySelectorAll('.brush-button').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  $('#eraser-button').addEventListener('click', (event) => {
    erasing = !erasing;
    event.currentTarget.classList.toggle('selected', erasing);
    event.currentTarget.setAttribute('aria-pressed', String(erasing));
  });
  $('#clear-button').addEventListener('click', clearCanvas);
  $('#start-button').addEventListener('click', beginGame);
  $('#retry-button').addEventListener('click', () => {
    clearInterval(timerId); clearInterval(memoryId); canvas.style.pointerEvents = 'auto';
    $('#start-button').disabled = false;
    showScreen('home');
  });
  $('#share-button').addEventListener('click', async () => {
    if (!navigator.share) {
      const text = `おぼえておえかきで描きました！そっくりスコアは${$('#score-value').textContent}点。`;
      const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(intentUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const blob = await new Promise((resolve, reject) => {
        resultCanvas.toBlob((imageBlob) => imageBlob ? resolve(imageBlob) : reject(new Error('PNG画像を作成できませんでした。')), 'image/png');
      });
      const imageFile = new File([blob], 'memory-sketch.png', { type: 'image/png' });
      const shareData = {
        title: 'おぼえておえかき',
        text: `おぼえておえかきで描きました！そっくりスコアは${$('#score-value').textContent}点。`,
        files: [imageFile]
      };
      if (navigator.canShare && !navigator.canShare({ files: shareData.files })) {
        alert('このブラウザは画像ファイルの共有に対応していません。対応ブラウザからお試しください。');
        return;
      }
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        alert('画像を共有できませんでした。もう一度お試しください。');
      }
    }
  });

  $('#download-button').addEventListener('click', () => {
    resultCanvas.toBlob((blob) => {
      if (!blob) {
        alert('画像を保存できませんでした。もう一度お試しください。');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'memory-sketch.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });

  loadTopics();
})();
