// 消息通知工具

// 使用 Web Audio API 生成简短提示音，无需外部音频文件
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// 播放消息提示音（简短的"叮"声）
export function playMessageSound() {
  // 检查提示音开关状态
  if (localStorage.getItem('lanchat-notify-sound') === 'off') return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // 柔和的提示音
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch {
    // 静默失败，不影响正常使用
  }
}

// 播放来电提示音（持续的铃声）
let ringOscillator: OscillatorNode | null = null;
let ringGain: GainNode | null = null;

export function playRingSound() {
  try {
    stopRingSound();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    ringOscillator = ctx.createOscillator();
    ringGain = ctx.createGain();

    ringOscillator.connect(ringGain);
    ringGain.connect(ctx.destination);

    ringOscillator.frequency.setValueAtTime(440, ctx.currentTime);
    ringOscillator.type = 'sine';

    ringGain.gain.setValueAtTime(0.1, ctx.currentTime);

    // 交替响铃效果
    const now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      ringGain.gain.setValueAtTime(0.1, now + i * 0.8);
      ringGain.gain.setValueAtTime(0, now + i * 0.8 + 0.4);
    }

    ringOscillator.start(now);
    ringOscillator.stop(now + 4.8);
  } catch {
    // 静默失败
  }
}

export function stopRingSound() {
  try {
    if (ringOscillator) {
      ringOscillator.stop();
      ringOscillator = null;
    }
    ringGain = null;
  } catch {
    // 忽略
  }
}
