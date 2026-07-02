const imageInput = document.getElementById("imageInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn = document.getElementById("resetBtn");

const thresholdRange = document.getElementById("thresholdRange");
const thresholdValue = document.getElementById("thresholdValue");

const originalCanvas = document.getElementById("originalCanvas");
const processedCanvas = document.getElementById("processedCanvas");

const originalCtx = originalCanvas.getContext("2d");
const processedCtx = processedCanvas.getContext("2d");

const symbolsList = document.getElementById("symbolsList");
const spellResult = document.getElementById("spellResult");

let loadedImage = null;
let lastDetectedSymbols = [];

const SYMBOL_LABELS = {
  circle: "Cercle d’activation",
  triangle: "Triangle — feu",
  square: "Carré — protection",
  wave: "Vague — eau",
  line_up: "Trait vertical — projection",
  unknown: "Symbole inconnu"
};

const SPELLS = [
  {
    id: "fire_projectile",
    name: "Projectile de feu",
    required: ["circle", "triangle", "line_up"],
    description: "Activation + feu + projection."
  },
  {
    id: "fire_barrier",
    name: "Barrière de feu",
    required: ["circle", "triangle", "square"],
    description: "Activation + feu + protection."
  },
  {
    id: "water_shield",
    name: "Bouclier d’eau",
    required: ["circle", "wave", "square"],
    description: "Activation + eau + protection."
  },
  {
    id: "water_jet",
    name: "Jet d’eau",
    required: ["circle", "wave", "line_up"],
    description: "Activation + eau + projection."
  },
  {
    id: "simple_barrier",
    name: "Barrière simple",
    required: ["circle", "square"],
    description: "Activation + protection."
  }
];

thresholdRange.addEventListener("input", () => {
  thresholdValue.textContent = thresholdRange.value;
});

imageInput.addEventListener("change", handleImageUpload);
analyzeBtn.addEventListener("click", analyzeSpell);
resetBtn.addEventListener("click", resetApp);

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      loadedImage = img;
      drawOriginalImage(img);
      clearProcessedCanvas();
      clearResults();
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function drawOriginalImage(img) {
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / img.width);

  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  originalCanvas.width = width;
  originalCanvas.height = height;
  processedCanvas.width = width;
  processedCanvas.height = height;

  originalCtx.clearRect(0, 0, width, height);
  originalCtx.drawImage(img, 0, 0, width, height);
}

function clearProcessedCanvas() {
  processedCtx.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
}

function clearResults() {
  lastDetectedSymbols = [];
  symbolsList.innerHTML = "<li>Aucun symbole détecté.</li>";
  spellResult.textContent = "Aucun sort analysé.";
}

function resetApp() {
  loadedImage = null;
  imageInput.value = "";
  originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  processedCtx.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
  clearResults();
}

function analyzeSpell() {
  if (!loadedImage) {
    spellResult.textContent = "Ajoute d’abord une photo du sort.";
    return;
  }

  const threshold = Number(thresholdRange.value);

  const imageData = originalCtx.getImageData(
    0,
    0,
    originalCanvas.width,
    originalCanvas.height
  );

  const binary = createBinaryMask(imageData, threshold);
  const cleaned = removeNoise(binary.mask, binary.width, binary.height);

  drawBinaryImage(cleaned, binary.width, binary.height);

  const components = findComponents(cleaned, binary.width, binary.height);

  const filteredComponents = components.filter(component => {
    const boxArea = component.width * component.height;
    const imageArea = binary.width * binary.height;

    if (component.pixelCount < imageArea * 0.0003) return false;
    if (boxArea < imageArea * 0.0006) return false;
    if (boxArea > imageArea * 0.65) return false;

    return true;
  });

  const detected = filteredComponents
    .map(component => classifyComponent(component))
    .filter(result => result.id !== "unknown");

  lastDetectedSymbols = removeDuplicateSymbols(detected);

  drawDetectionBoxes(lastDetectedSymbols);
  renderDetectedSymbols(lastDetectedSymbols);
  renderSpellResult(lastDetectedSymbols);
}

function createBinaryMask(imageData, threshold) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    mask[pixelIndex] = luminance < threshold ? 1 : 0;
  }

  return { mask, width, height };
}

function removeNoise(mask, width, height) {
  const output = new Uint8Array(mask);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;

      if (mask[index] === 0) continue;

      let neighbours = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const neighbourIndex = (y + dy) * width + (x + dx);

          if (mask[neighbourIndex] === 1) {
            neighbours++;
          }
        }
      }

      if (neighbours <= 1) {
        output[index] = 0;
      }
    }
  }

  return output;
}

function drawBinaryImage(mask, width, height) {
  const output = processedCtx.createImageData(width, height);

  for (let i = 0; i < mask.length; i++) {
    const value = mask[i] === 1 ? 0 : 255;

    output.data[i * 4] = value;
    output.data[i * 4 + 1] = value;
    output.data[i * 4 + 2] = value;
    output.data[i * 4 + 3] = 255;
  }

  processedCtx.putImageData(output, 0, 0);
}

function findComponents(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIndex = y * width + x;

      if (mask[startIndex] === 0 || visited[startIndex] === 1) {
        continue;
      }

      const queue = [[x, y]];
      const pixels = [];

      visited[startIndex] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (queue.length > 0) {
        const [cx, cy] = queue.shift();

        pixels.push([cx, cy]);

        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        for (const [dx, dy] of directions) {
          const nx = cx + dx;
          const ny = cy + dy;

          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const nextIndex = ny * width + nx;

          if (mask[nextIndex] === 1 && visited[nextIndex] === 0) {
            visited[nextIndex] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      components.push({
        pixels,
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelCount: pixels.length
      });
    }
  }

  return components;
}

function classifyComponent(component) {
  const aspectRatio = component.width / component.height;
  const boxArea = component.width * component.height;
  const density = component.pixelCount / boxArea;

  if (component.height > component.width * 2.2 && density < 0.35) {
    return {
      id: "line_up",
      confidence: 0.88,
      component
    };
  }

  const normalized = normalizeComponent(component, 64);
  const templates = getTemplates(64);

  let best = {
    id: "unknown",
    score: 0
  };

  for (const template of templates) {
    const score = compareMasks(
      dilateMask(normalized, 64, 64, 2),
      dilateMask(template.mask, 64, 64, 2)
    );

    if (score > best.score) {
      best = {
        id: template.id,
        score
      };
    }
  }

  let minimumScore = best.id === "circle" ? 0.15 : 0.18;

  if (best.score < minimumScore) {
    return {
      id: "unknown",
      confidence: best.score,
      component
    };
  }

  if (["circle", "square"].includes(best.id) && (aspectRatio < 0.55 || aspectRatio > 1.8)) {
    return {
      id: "unknown",
      confidence: best.score,
      component
    };
  }

  if (best.id === "triangle" && (aspectRatio < 0.45 || aspectRatio > 2.0)) {
    return {
      id: "unknown",
      confidence: best.score,
      component
    };
  }

  return {
    id: best.id,
    confidence: best.score,
    component
  };
}

function normalizeComponent(component, size) {
  const output = new Uint8Array(size * size);
  const padding = 6;

  const sourceWidth = component.width || 1;
  const sourceHeight = component.height || 1;

  const scale = (size - padding * 2) / Math.max(sourceWidth, sourceHeight);

  const offsetX = (size - sourceWidth * scale) / 2;
  const offsetY = (size - sourceHeight * scale) / 2;

  for (const [x, y] of component.pixels) {
    const nx = Math.round((x - component.minX) * scale + offsetX);
    const ny = Math.round((y - component.minY) * scale + offsetY);

    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      output[ny * size + nx] = 1;
    }
  }

  return output;
}

function getTemplates(size) {
  return [
    { id: "circle", mask: createTemplate(size, drawTemplateCircle) },
    { id: "triangle", mask: createTemplate(size, drawTemplateTriangle) },
    { id: "square", mask: createTemplate(size, drawTemplateSquare) },
    { id: "wave", mask: createTemplate(size, drawTemplateWave) },
    { id: "line_up", mask: createTemplate(size, drawTemplateVerticalLine) }
  ];
}

function createTemplate(size, drawFunction) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawFunction(ctx, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const mask = new Uint8Array(size * size);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const pixelIndex = i / 4;
    const r = imageData.data[i];

    mask[pixelIndex] = r < 128 ? 1 : 0;
  }

  return mask;
}

function drawTemplateCircle(ctx, size) {
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTemplateTriangle(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.18);
  ctx.lineTo(size * 0.82, size * 0.78);
  ctx.lineTo(size * 0.18, size * 0.78);
  ctx.closePath();
  ctx.stroke();
}

function drawTemplateSquare(ctx, size) {
  ctx.beginPath();
  ctx.rect(size * 0.22, size * 0.22, size * 0.56, size * 0.56);
  ctx.stroke();
}

function drawTemplateWave(ctx, size) {
  ctx.beginPath();

  const startX = size * 0.12;
  const endX = size * 0.88;
  const centerY = size * 0.5;
  const amplitude = size * 0.16;

  ctx.moveTo(startX, centerY);

  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = startX + (endX - startX) * t;
    const y = centerY + Math.sin(t * Math.PI * 4) * amplitude;

    ctx.lineTo(x, y);
  }

  ctx.stroke();
}

function drawTemplateVerticalLine(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.82);
  ctx.lineTo(size / 2, size * 0.18);
  ctx.stroke();
}

function dilateMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (mask[index] === 0) continue;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          output[ny * width + nx] = 1;
        }
      }
    }
  }

  return output;
}

function compareMasks(maskA, maskB) {
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < maskA.length; i++) {
    if (maskA[i] === 1 || maskB[i] === 1) {
      union++;
    }

    if (maskA[i] === 1 && maskB[i] === 1) {
      intersection++;
    }
  }

  if (union === 0) return 0;

  return intersection / union;
}

function removeDuplicateSymbols(results) {
  const bestBySymbol = new Map();

  for (const result of results) {
    const current = bestBySymbol.get(result.id);

    if (!current || result.confidence > current.confidence) {
      bestBySymbol.set(result.id, result);
    }
  }

  return Array.from(bestBySymbol.values()).sort((a, b) => {
    return b.component.pixelCount - a.component.pixelCount;
  });
}

function drawDetectionBoxes(detectedSymbols) {
  processedCtx.lineWidth = 3;
  processedCtx.font = "16px system-ui";

  for (const result of detectedSymbols) {
    const component = result.component;

    processedCtx.strokeStyle = "#e53935";
    processedCtx.fillStyle = "#e53935";

    processedCtx.strokeRect(
      component.minX,
      component.minY,
      component.width,
      component.height
    );

    const label = SYMBOL_LABELS[result.id] || result.id;

    processedCtx.fillText(
      label,
      component.minX,
      Math.max(16, component.minY - 6)
    );
  }
}

function renderDetectedSymbols(results) {
  symbolsList.innerHTML = "";

  if (results.length === 0) {
    symbolsList.innerHTML = "<li>Aucun symbole reconnu.</li>";
    return;
  }

  for (const result of results) {
    const li = document.createElement("li");

    const label = SYMBOL_LABELS[result.id] || result.id;
    const confidence = Math.round(result.confidence * 100);

    li.textContent = `${label} — confiance : ${confidence}%`;

    symbolsList.appendChild(li);
  }
}

function renderSpellResult(results) {
  if (results.length === 0) {
    spellResult.textContent = "Aucun sort reconnu.";
    return;
  }

  const detectedIds = new Set(results.map(result => result.id));

  const spell = SPELLS.find(candidate => {
    return candidate.required.every(symbol => detectedIds.has(symbol));
  });

  if (!spell) {
    spellResult.textContent = "Aucun sort connu ne correspond à cette combinaison.";
    return;
  }

  spellResult.textContent = `${spell.name} — ${spell.description}`;
}
