const audioVideo = document.getElementById("video1");
const video2 = document.getElementById("video2");
const video3 = document.getElementById("video3");
const playToggle = document.getElementById("playToggle");
const mixSlider = document.getElementById("mixSlider");
const tonePercent = document.getElementById("tonePercent");
const noisePercent = document.getElementById("noisePercent");
const volumeSlider = document.getElementById("volumeSlider");
const loopToggle = document.getElementById("loopToggle");
const overlayTop = document.getElementById("overlay-top");
const overlayBottom = document.getElementById("overlay-bottom");
const videoButtons = Array.from(document.querySelectorAll("[data-video]"));
const modeInputs = Array.from(document.querySelectorAll("input[name='mode']"));

const videos = {
  1: audioVideo,
  2: video2,
  3: video3,
};

let activeVideoId = 1;
let activeVideo = audioVideo;
let audioCtx;
let splitter;
let sepToneGain;
let sepNoiseGain;
let combToneGain;
let combNoiseGain;
let combSum;
let merger;
let masterGain;
let mode = "separada";
let syncTimer;

function initVideoElements() {
  // Keep the element unmuted so Web Audio can output its signal.
  audioVideo.muted = false;
  audioVideo.volume = 1;
  video2.muted = true;
  video3.muted = true;
}

function initAudioGraph() {
  if (audioCtx) return;

  audioCtx = new AudioContext();
  const source = audioCtx.createMediaElementSource(audioVideo);
  splitter = audioCtx.createChannelSplitter(2);
  sepToneGain = audioCtx.createGain();
  sepNoiseGain = audioCtx.createGain();
  combToneGain = audioCtx.createGain();
  combNoiseGain = audioCtx.createGain();
  combSum = audioCtx.createGain();
  merger = audioCtx.createChannelMerger(2);

  source.connect(splitter);

  splitter.connect(sepToneGain, 0);
  splitter.connect(sepNoiseGain, 1);
  sepToneGain.connect(merger, 0, 0);
  sepNoiseGain.connect(merger, 0, 1);

  splitter.connect(combToneGain, 0);
  splitter.connect(combNoiseGain, 1);
  combToneGain.connect(combSum);
  combNoiseGain.connect(combSum);
  combSum.connect(merger, 0, 0);
  combSum.connect(merger, 0, 1);

  masterGain = audioCtx.createGain();
  masterGain.gain.value = parseFloat(volumeSlider.value);
  merger.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  setMode(mode);
  updateMix();
}

async function ensureAudioReady() {
  initAudioGraph();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
}

function setMode(nextMode) {
  mode = nextMode;
  const combined = mode === "combinada";
  mixSlider.disabled = !combined;

  if (!audioCtx) {
    updateOverlay();
    return;
  }

  if (combined) {
    sepToneGain.gain.value = 0;
    sepNoiseGain.gain.value = 0;
    updateMix();
  } else {
    combToneGain.gain.value = 0;
    combNoiseGain.gain.value = 0;
    sepToneGain.gain.value = 1;
    sepNoiseGain.gain.value = 1;
  }

  updateOverlay();
}

function updateMix() {
  const mix = parseFloat(mixSlider.value);
  mixSlider.setAttribute("aria-valuenow", mix.toFixed(2));

  const toneValue = Math.round((1 - mix) * 100);
  const noiseValue = Math.round(mix * 100);
  if (tonePercent) tonePercent.textContent = `${toneValue}%`;
  if (noisePercent) noisePercent.textContent = `${noiseValue}%`;

  if (!audioCtx || mode !== "combinada") {
    updateOverlay();
    return;
  }

  const toneWeight = 1 - mix;
  const noiseWeight = mix;
  combToneGain.gain.value = toneWeight;
  combNoiseGain.gain.value = noiseWeight;

  updateOverlay();
}

function updateOverlay() {
  const isVideo1 = activeVideoId === 1;
  const combined = mode === "combinada";
  const mix = parseFloat(mixSlider.value);

  if (!isVideo1) {
    overlayTop.style.opacity = 0;
    overlayBottom.style.opacity = 0;
    overlayTop.style.display = "none";
    overlayBottom.style.display = "none";
    return;
  }

  overlayTop.style.display = "block";
  overlayBottom.style.display = "block";

  if (!combined || Math.abs(mix - 0.5) < 0.01) {
    overlayTop.style.opacity = 0;
    overlayBottom.style.opacity = 0;
    return;
  }

  const intensity = Math.min(Math.abs(mix - 0.5) * 2, 1) * 0.75;
  if (mix > 0.5) {
    overlayTop.style.opacity = intensity;
    overlayBottom.style.opacity = 0;
  } else {
    overlayTop.style.opacity = 0;
    overlayBottom.style.opacity = intensity;
  }
}

function syncActiveVideo(force = false) {
  if (!activeVideo || activeVideo === audioVideo) return;
  const delta = Math.abs(activeVideo.currentTime - audioVideo.currentTime);
  if (force || delta > 0.05) {
    activeVideo.currentTime = audioVideo.currentTime;
  }
}

function startSyncLoop() {
  stopSyncLoop();
  syncTimer = window.setInterval(() => {
    syncActiveVideo();
  }, 200);
}

function stopSyncLoop() {
  if (syncTimer) {
    window.clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function handlePlayToggle() {
  await ensureAudioReady();

  if (audioVideo.paused) {
    await audioVideo.play();
    if (activeVideo !== audioVideo) {
      syncActiveVideo(true);
      await activeVideo.play();
    }
    playToggle.textContent = "Pausar";
    startSyncLoop();
  } else {
    audioVideo.pause();
    if (activeVideo && activeVideo !== audioVideo) {
      activeVideo.pause();
    }
    playToggle.textContent = "Reproducir";
    stopSyncLoop();
  }
}

async function setActiveVideo(id) {
  const nextId = Number(id);
  if (!videos[nextId] || nextId === activeVideoId) return;

  const wasPlaying = !audioVideo.paused;
  const nextVideo = videos[nextId];

  if (activeVideo !== audioVideo) {
    activeVideo.pause();
  }

  activeVideo.classList.remove("active");
  nextVideo.classList.add("active");
  activeVideo = nextVideo;
  activeVideoId = nextId;

  videoButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.video) === nextId);
  });

  if (nextVideo !== audioVideo) {
    syncActiveVideo(true);
    if (wasPlaying) {
      await nextVideo.play();
    } else {
      nextVideo.pause();
    }
  }

  updateOverlay();
}

videoButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveVideo(button.dataset.video));
});

modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      setMode(input.value);
    }
  });
});

mixSlider.addEventListener("input", updateMix);
playToggle.addEventListener("click", handlePlayToggle);
volumeSlider.addEventListener("input", () => {
  const value = parseFloat(volumeSlider.value);
  volumeSlider.setAttribute("aria-valuenow", value.toFixed(2));
  if (masterGain) {
    masterGain.gain.value = value;
  }
});

loopToggle.addEventListener("change", () => {
  const loop = loopToggle.checked;
  Object.values(videos).forEach((video) => {
    video.loop = loop;
  });
});

audioVideo.addEventListener("ended", () => {
  playToggle.textContent = "Reproducir";
  stopSyncLoop();
});

audioVideo.addEventListener("timeupdate", () => {
  if (activeVideo !== audioVideo) {
    syncActiveVideo();
  }
});

initVideoElements();
updateOverlay();
