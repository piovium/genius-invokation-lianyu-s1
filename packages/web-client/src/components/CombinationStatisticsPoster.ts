import type { AssetsManager } from "@gi-tcg/assets-manager";

export interface CombinationStatisticsPosterItem {
  id: string;
  appearances: number;
  appearanceRate: number;
  wins: number;
  winRate: number;
  awayAppearances: number;
  awayWinRate: number;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const colors = [
  "#6750a4",
  "#087f73",
  "#c2415b",
  "#2f6db0",
  "#b26a00",
  "#7b5b3a",
  "#4f7c44",
  "#9c4f96",
  "#53728a",
  "#a34d2d",
] as const;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  if (context.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length && context.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function drawCircleImage(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  x: number,
  y: number,
  size: number,
) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, x, y, size, size);
  context.restore();
}

function download(canvas: HTMLCanvasElement) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("统计图生成失败"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "三角色组合出场率.png";
      link.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

export async function exportCombinationStatisticsPoster(
  rows: CombinationStatisticsPosterItem[],
  gameCount: number,
  assetsManager: AssetsManager,
) {
  if (!rows.length) throw new Error("暂无三角色组合统计数据");
  const sorted = [...rows].sort(
    (a, b) => b.appearanceRate - a.appearanceRate || a.id.localeCompare(b.id),
  );
  const top = sorted.slice(0, 10);
  const otherRate = sorted
    .slice(10)
    .reduce((sum, item) => sum + item.appearanceRate, 0);
  const totalRate =
    top.reduce((sum, item) => sum + item.appearanceRate, 0) + otherRate;
  const characterIds = new Set(
    top.flatMap((item) => item.id.split(":").map(Number)),
  );
  const images = new Map<number, ImageBitmap>();
  await Promise.all(
    [...characterIds].map(async (id) => {
      try {
        const blob = await assetsManager.getImage(id, { type: "icon" });
        images.set(id, await createImageBitmap(blob));
      } catch {
        // Missing icons use a neutral placeholder without aborting the export.
      }
    }),
  );

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建统计图画布");
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#f5f1fb");
  gradient.addColorStop(0.5, "#fbfaf8");
  gradient.addColorStop(1, "#eef7f5");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#1e1a22";
  context.font = "700 46px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("三角色组合出场率 TOP 10", WIDTH / 2, 62);
  context.fillStyle = "#716b75";
  context.font = "22px system-ui, sans-serif";
  context.fillText(`有效样本 ${gameCount} 局`, WIDTH / 2, 96);

  const centerX = WIDTH / 2;
  const centerY = 520;
  const radius = 286;
  let angle = -Math.PI / 2;
  const slices = [
    ...top.map((item, index) => ({
      value: item.appearanceRate,
      color: colors[index]!,
    })),
    ...(otherRate > 0 ? [{ value: otherRate, color: "#b8b4bc" }] : []),
  ];
  for (const slice of slices) {
    const nextAngle = angle + (slice.value / totalRate) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, angle, nextAngle);
    context.closePath();
    context.fillStyle = slice.color;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 4;
    context.stroke();
    angle = nextAngle;
  }
  context.fillStyle = "#fbfaf8";
  context.beginPath();
  context.arc(centerX, centerY, 142, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#252128";
  context.font = "700 31px system-ui, sans-serif";
  context.fillText("组合出场率", centerX, centerY - 8);
  context.fillStyle = "#77717b";
  context.font = "22px system-ui, sans-serif";
  context.fillText(
    otherRate > 0 ? `其他 ${percent(otherRate)}` : "TOP 10 覆盖全部组合",
    centerX,
    centerY + 34,
  );

  const cardWidth = 520;
  const cardHeight = 164;
  const cardGap = 16;
  const cardTop = 120;
  const leftX = 50;
  const rightX = WIDTH - 50 - cardWidth;
  for (const [index, item] of top.entries()) {
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = column === 0 ? leftX : rightX;
    const y = cardTop + row * (cardHeight + cardGap);
    const color = colors[index]!;
    context.fillStyle = "#ffffffeb";
    context.strokeStyle = color;
    context.lineWidth = 5;
    roundedRect(context, x, y, cardWidth, cardHeight, 14);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.font = "700 24px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(`#${index + 1}`, x + 18, y + 34);

    const ids = item.id.split(":").map(Number);
    ids.forEach((id, avatarIndex) => {
      const avatarX = x + 22 + avatarIndex * 54;
      const avatarY = y + 46;
      const image = images.get(id);
      if (image) {
        drawCircleImage(context, image, avatarX, avatarY, 68);
      } else {
        context.fillStyle = "#ddd9df";
        context.beginPath();
        context.arc(avatarX + 34, avatarY + 34, 34, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(avatarX + 34, avatarY + 34, 34, 0, Math.PI * 2);
      context.stroke();
    });
    const combinationName = ids
      .map((id) => assetsManager.getNameSync(id) ?? String(id))
      .join(" / ");
    context.fillStyle = "#27232a";
    context.font = "700 18px system-ui, sans-serif";
    context.fillText(
      fitText(context, combinationName, 186),
      x + 22,
      y + 144,
    );

    const metrics = [
      ["出场数", String(item.appearances)],
      ["出场率", percent(item.appearanceRate)],
      ["胜场", String(item.wins)],
      ["胜率", percent(item.winRate)],
      ["外战场数", String(item.awayAppearances)],
      ["外战胜率", percent(item.awayWinRate)],
    ];
    metrics.forEach(([label, value], metricIndex) => {
      const metricColumn = metricIndex % 2;
      const metricRow = Math.floor(metricIndex / 2);
      const metricX = x + 224 + metricColumn * 142;
      const metricY = y + 39 + metricRow * 48;
      context.fillStyle = "#858087";
      context.font = "17px system-ui, sans-serif";
      context.fillText(label!, metricX, metricY);
      context.fillStyle = "#29252c";
      context.font = "700 21px system-ui, sans-serif";
      context.fillText(value!, metricX + 82, metricY);
    });
  }
  context.fillStyle = "#918b94";
  context.font = "17px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("恋雨杯赛事管理系统生成", WIDTH / 2, HEIGHT - 24);
  await download(canvas);
  for (const image of images.values()) image.close();
}
