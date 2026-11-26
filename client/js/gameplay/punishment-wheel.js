import { soundFX } from '../utils/sound.js';

const SECTOR_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#e11d48'
];

export class PunishmentWheel {
  constructor(canvas, punishments = []) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.punishments = punishments;
    this.angle = 0; // radian
    this.isSpinning = false;
    this.draw();
  }

  setPunishments(punishments) {
    this.punishments = punishments;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 14;

    ctx.clearRect(0, 0, size, size);

    const items = this.punishments.length ? this.punishments : ['Hukuman 1', 'Hukuman 2'];
    const sliceAngle = (Math.PI * 2) / items.length;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);

    items.forEach((text, i) => {
      const start = i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = SECTOR_COLORS[i % SECTOR_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Label teks di dalam sektor
      ctx.save();
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      const label = text.length > 22 ? `${text.slice(0, 20)}…` : text;
      ctx.fillText(label, radius - 18, 5);
      ctx.restore();
    });

    ctx.restore();

    // Lingkaran tengah
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Penunjuk (pointer) di sisi atas jam 12 (-PI/2)
    ctx.beginPath();
    ctx.moveTo(cx - 14, 4);
    ctx.lineTo(cx + 14, 4);
    ctx.lineTo(cx, 30);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  }

  /**
   * Memutar roda menuju index hukuman yang sudah ditentukan server.
   */
  spinToIndex(targetIndex, durationMs = 4500) {
    if (this.isSpinning) return Promise.resolve();
    this.isSpinning = true;

    const total = Math.max(2, this.punishments.length);
    const sliceAngle = (Math.PI * 2) / total;

    // Pointer berada di -PI/2 (atas). Hitung sudut agar tengah sektor target berhenti di -PI/2.
    const sectorCenter = targetIndex * sliceAngle + sliceAngle / 2;
    const targetMod = ((-Math.PI / 2 - sectorCenter) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const currentMod = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const delta = (targetMod - currentMod + Math.PI * 2) % (Math.PI * 2);
    const extraSpins = 6 * Math.PI * 2;

    const startAngle = this.angle;
    const finalAngle = startAngle + extraSpins + delta;
    const startTime = performance.now();
    let lastSector = -1;

    return new Promise((resolve) => {
      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        // Ease out quintic
        const eased = 1 - Math.pow(1 - t, 4);
        this.angle = startAngle + (finalAngle - startAngle) * eased;

        const currentSector = Math.floor(
          (((-Math.PI / 2 - this.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / sliceAngle
        );
        if (currentSector !== lastSector) {
          lastSector = currentSector;
          soundFX.wheelTick();
        }

        this.draw();

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.isSpinning = false;
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
