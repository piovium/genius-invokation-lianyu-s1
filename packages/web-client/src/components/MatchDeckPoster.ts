import type { AssetsManager } from "@gi-tcg/assets-manager";
import type { TournamentMatch } from "../api/models";
import { BACKEND_BASE_URL } from "../config";

const WIDTH = 1920;
const MARGIN = 64;
const GUTTER = 48;
const HEADER_HEIGHT = 170;
const PLAYER_HEIGHT = 132;
const DECK_HEIGHT = 254;
const CARD_RATIO = 7 / 12;
const sideColors = ["#6750a4", "#087f73"] as const;

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

function drawCover(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const croppedWidth = width / scale;
  const croppedHeight = height / scale;
  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(
    image,
    (sourceWidth - croppedWidth) / 2,
    (sourceHeight - croppedHeight) / 2,
    croppedWidth,
    croppedHeight,
    x,
    y,
    width,
    height,
  );
  context.restore();
}

async function blobImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function posterFileName(match: TournamentMatch) {
  const eventName = match.event?.name ?? "比赛";
  return `${eventName}-盘次${match.id}-牌组公示.png`.replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
}

export async function exportMatchDeckPoster(
  match: TournamentMatch,
  assetsManager: AssetsManager,
) {
  const participants = [0, 1].map((who) =>
    match.participants.find((participant) => participant.who === who),
  );
  const deckSides = participants.map((participant) =>
    participant
      ? match.matchDecks.filter((deck) => deck.userId === participant.userId)
      : [],
  );
  const deckRows = Math.max(1, ...deckSides.map((decks) => decks.length));
  const height = HEADER_HEIGHT + PLAYER_HEIGHT + deckRows * DECK_HEIGHT + MARGIN;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建海报画布");

  const cardIds = new Set(
    deckSides.flatMap((decks) =>
      decks.flatMap((deck) => [
        ...deck.deckJson.characters,
        ...deck.deckJson.cards,
      ]),
    ),
  );
  const cardImages = new Map<number, ImageBitmap>();
  await Promise.all(
    [...cardIds].map(async (id) => {
      try {
        const blob = await assetsManager.getImage(id, { type: "cardFace" });
        cardImages.set(id, await blobImage(blob));
      } catch {
        // A missing asset is rendered as a placeholder so one card cannot abort export.
      }
    }),
  );
  const avatars = new Map<number, ImageBitmap>();
  await Promise.all(
    participants.flatMap((participant) =>
      participant
        ? [
            (async () => {
              try {
                const response = await fetch(
                  `${BACKEND_BASE_URL}/users/${participant.userId}/avatar`,
                );
                if (response.ok) {
                  avatars.set(
                    participant.userId,
                    await blobImage(await response.blob()),
                  );
                }
              } catch {
                // The poster still includes the player's identity if avatar loading fails.
              }
            })(),
          ]
        : [],
    ),
  );

  const gradient = context.createLinearGradient(0, 0, WIDTH, height);
  gradient.addColorStop(0, "#f6f2ff");
  gradient.addColorStop(0.5, "#fafafa");
  gradient.addColorStop(1, "#ecf8f5");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = "#17151c";
  context.font = "700 52px system-ui, sans-serif";
  context.fillText("比赛牌组公示", MARGIN, 76);
  context.font = "700 30px system-ui, sans-serif";
  context.fillText(match.event?.name ?? "比赛场次", MARGIN, 124);
  context.fillStyle = "#66616d";
  context.font = "24px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(
    `盘次 #${match.id}  ·  ${match.maxGames} 局 ${match.winsRequired} 胜`,
    WIDTH - MARGIN,
    112,
  );
  context.textAlign = "left";

  const sideWidth = (WIDTH - MARGIN * 2 - GUTTER) / 2;
  for (const who of [0, 1] as const) {
    const x = MARGIN + who * (sideWidth + GUTTER);
    const participant = participants[who];
    const color = sideColors[who];
    context.fillStyle = color;
    context.fillRect(x, HEADER_HEIGHT - 12, sideWidth, 6);
    const avatarX = x + 8;
    const avatarY = HEADER_HEIGHT + 12;
    const avatarSize = 92;
    const avatar = participant ? avatars.get(participant.userId) : undefined;
    if (avatar) {
      context.save();
      context.beginPath();
      context.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2,
      );
      context.clip();
      context.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      context.restore();
    } else {
      context.fillStyle = "#ddd8e2";
      context.beginPath();
      context.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.fillStyle = "#211e26";
    context.font = "700 34px system-ui, sans-serif";
    context.fillText(
      participant?.user.name ?? "轮空",
      avatarX + avatarSize + 24,
      avatarY + 38,
    );
    context.fillStyle = "#6d6873";
    context.font = "24px system-ui, sans-serif";
    context.fillText(
      participant?.user.qq ? `QQ ${participant.user.qq}` : "无选手信息",
      avatarX + avatarSize + 24,
      avatarY + 76,
    );

    const decks = deckSides[who];
    for (let deckIndex = 0; deckIndex < deckRows; deckIndex++) {
      const y = HEADER_HEIGHT + PLAYER_HEIGHT + deckIndex * DECK_HEIGHT;
      context.fillStyle = deckIndex % 2 ? "#ffffffa6" : "#ffffffd9";
      roundedRect(context, x, y, sideWidth, DECK_HEIGHT - 8, 18);
      context.fill();
      const deck = decks[deckIndex];
      if (!deck) {
        context.fillStyle = "#aaa4ad";
        context.font = "24px system-ui, sans-serif";
        context.fillText("无更多比赛牌组", x + 28, y + 54);
        continue;
      }
      context.fillStyle = color;
      context.font = "700 22px system-ui, sans-serif";
      context.fillText(
        String(deckIndex + 1).padStart(2, "0"),
        x + 22,
        y + 38,
      );
      const characterWidth = 90;
      const characterHeight = characterWidth / CARD_RATIO;
      deck.deckJson.characters.forEach((id, index) => {
        const cardX = x + 72 + index * (characterWidth + 10);
        const cardY = y + 48;
        const image = cardImages.get(id);
        if (image) {
          drawCover(
            context,
            image,
            cardX,
            cardY,
            characterWidth,
            characterHeight,
            9,
          );
        }
      });
      const actionWidth = 43;
      const actionHeight = actionWidth / CARD_RATIO;
      const actionStartX = x + 378;
      deck.deckJson.cards.forEach((id, index) => {
        const column = index % 10;
        const row = Math.floor(index / 10);
        const cardX = actionStartX + column * (actionWidth + 5);
        const cardY = y + 8 + row * (actionHeight + 5);
        const image = cardImages.get(id);
        if (image) {
          drawCover(
            context,
            image,
            cardX,
            cardY,
            actionWidth,
            actionHeight,
            5,
          );
        } else {
          context.fillStyle = "#d9d5dd";
          roundedRect(context, cardX, cardY, actionWidth, actionHeight, 5);
          context.fill();
        }
      });
    }
  }
  context.fillStyle = "#8c8790";
  context.font = "18px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("恋雨杯赛事管理系统生成", WIDTH / 2, height - 24);
  context.textAlign = "left";

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("海报生成失败"))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = posterFileName(match);
  link.click();
  URL.revokeObjectURL(url);
  for (const image of cardImages.values()) image.close();
  for (const image of avatars.values()) image.close();
}
