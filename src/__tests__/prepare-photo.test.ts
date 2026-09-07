/**
 * Подготовка снимка уменьшает файл, а не увеличивает его.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Стояло `resize({ width: 1600 })` для любого кадра, без оглядки на его
 * размеры. Из этого следовали две вещи, обе противоположные замыслу:
 *
 *   • вертикальный снимок 3000×4000 (а полку и витрину снимают вертикально)
 *     превращался в 1600×2133 — длинная сторона на треть больше задуманных
 *     1600, файл соответственно тяжелее;
 *
 *   • кадр 800×600, уже маленький, РАСТЯГИВАЛСЯ до 1600×1200. Подготовка к
 *     отправке делала файл больше — ровно на медленной связи, ради которой
 *     она и написана.
 *
 * Проверяется здесь именно это: какую сторону просят уменьшить и просят ли
 * вообще.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

/** Что попросили у уменьшителя за последний вызов. */
const mockResize = jest.fn();
const mockSaveAsync = jest.fn(async () => ({ base64: "QUJDRA==" }));
const mockRenderAsync = jest.fn(async () => ({ saveAsync: mockSaveAsync }));

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: () => ({ resize: mockResize, renderAsync: mockRenderAsync }) },
  SaveFormat: { JPEG: "jpeg" },
}));

/** Что отвечает Image.getSize на этот снимок. */
let mockSize: { width: number; height: number } | "fail" = { width: 4000, height: 3000 };

jest.mock("react-native", () => ({
  ...(jest.requireActual("react-native") as object),
  Image: {
    getSize: (
      _uri: string,
      ok: (w: number, h: number) => void,
      fail: () => void,
    ) => {
      if (mockSize === "fail") fail();
      else ok(mockSize.width, mockSize.height);
    },
  },
}));

import { preparePhoto } from "../lib/prepare-photo";

beforeEach(() => {
  mockResize.mockClear();
  mockSize = { width: 4000, height: 3000 };
});

describe("какую сторону уменьшают", () => {
  it("горизонтальный кадр — по ширине", async () => {
    mockSize = { width: 4000, height: 3000 };
    await preparePhoto("file:///shelf.jpg");
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
  });

  it("вертикальный кадр — по высоте", async () => {
    /*
      Раньше здесь просили ширину 1600, и высота выходила 2133 — длинная
      сторона больше предела, ради которого всё делается.
    */
    mockSize = { width: 3000, height: 4000 };
    await preparePhoto("file:///shelf.jpg");
    expect(mockResize).toHaveBeenCalledWith({ height: 1600 });
  });

  it("квадратный кадр — по любой стороне, лишь бы одной", async () => {
    mockSize = { width: 2400, height: 2400 };
    await preparePhoto("file:///shelf.jpg");
    expect(mockResize).toHaveBeenCalledTimes(1);
    const arg = mockResize.mock.calls[0][0] as Record<string, number>;
    expect(Object.keys(arg)).toHaveLength(1);
    expect(Object.values(arg)[0]).toBe(1600);
  });
});

describe("маленький кадр не трогают", () => {
  it("снимок меньше предела не уменьшают и не растягивают", async () => {
    mockSize = { width: 800, height: 600 };
    await preparePhoto("file:///small.jpg");
    expect(
      mockResize,
      // Именно растягивание и было бедой: файл рос на подготовке к отправке.
    ).not.toHaveBeenCalled();
  });

  it("кадр ровно по пределу не трогают", async () => {
    mockSize = { width: 1600, height: 1200 };
    await preparePhoto("file:///exact.jpg");
    expect(mockResize).not.toHaveBeenCalled();
  });
});

describe("если размер прочитать не удалось", () => {
  it("фото всё равно отправляется, уменьшенное по ширине", async () => {
    // Отказ заголовка не повод не отправить доказательство визита.
    mockSize = "fail";
    const out = await preparePhoto("file:///broken.jpg");
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});

describe("готовая строка", () => {
  it("отдаётся data-URL и размер в байтах", async () => {
    const out = await preparePhoto("file:///shelf.jpg");
    expect(out.dataUrl).toBe("data:image/jpeg;base64,QUJDRA==");
    // 8 символов base64 — это 6 байт.
    expect(out.bytes).toBe(6);
  });

  it("пустой ответ уменьшителя — понятный отказ, а не пустое фото", async () => {
    mockSaveAsync.mockResolvedValueOnce({ base64: "" } as never);
    await expect(preparePhoto("file:///shelf.jpg")).rejects.toThrow("подготовить фото");
  });
});
