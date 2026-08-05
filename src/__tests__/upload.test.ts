const mockPost = jest.fn();

// api.ts calls axios.create() at module scope, so the instance must already
// exist by the time the import below runs — hence the factory.
//
// `post` forwards rather than referencing mockPost directly: jest hoists this
// factory above the `const mockPost` declaration, and the import of ../api
// below is hoisted too, so the instance is built while mockPost is still
// undefined. Forwarding defers the lookup to call time.
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: () => ({
      post: (...args: unknown[]) => mockPost(...args),
      get: jest.fn(),
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    }),
    post: jest.fn(),
  },
}));

jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(async () => "token"),
    setItemAsync: jest.fn(async () => {}),
    deleteItemAsync: jest.fn(async () => {}),
  },
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { uploadFile, MAX_UPLOAD_BYTES } from "../api";

function ok(url = "https://s3/x.jpg") {
  return { status: 200, data: { result: { data: { json: { url } } } } };
}
function offline() {
  return new Error("Network Error");
}
function refused(message: string) {
  const e = new Error(message) as Error & { serverRejected?: boolean };
  e.serverRejected = true;
  return e;
}
/** base64 string whose decoded size is `bytes`. */
const payload = (bytes: number) => `data:image/jpeg;base64,${"A".repeat(Math.ceil(bytes / 0.75))}`;

// Deliberately tiny: api.ts logs the whole request body in __DEV__, and
// formatting a realistic multi-hundred-kilobyte string per call dominates the
// runtime of the suite. Size is only what the oversize case is about.
const small = payload(600);

describe("uploadFile", () => {
  // Real timers: modern fake timers also fake queueMicrotask, which stalls the
  // await chain inside uploadFile. The retry backoff is short enough to wait out.
  beforeEach(() => mockPost.mockReset());

  // A photo goes up as base64 inside the JSON body — 1.5–3 MB is normal. The
  // shared 15s timeout is sized for small round-trips and cut those uploads off
  // mid-flight, so on rural 3G they could not succeed at all.
  it("gives the upload far longer than the default request timeout", async () => {
    mockPost.mockResolvedValue(ok());
    await uploadFile(small, "visits");

    const opts = mockPost.mock.calls[0][2];
    expect(opts?.timeout).toBeGreaterThanOrEqual(60_000);
  });

  // Losing the photo means a merchandiser has to walk back into the shop.
  // Signal on the road drops for seconds at a time, so spaced retries recover
  // most of these.
  it("retries a dropped upload and returns the url once it lands", async () => {
    mockPost.mockRejectedValueOnce(offline()).mockResolvedValueOnce(ok("https://s3/ok.jpg"));

    await expect(uploadFile(small, "visits")).resolves.toBe("https://s3/ok.jpg");
    expect(mockPost).toHaveBeenCalledTimes(2);
  }, 20_000);

  it("gives up after a bounded number of attempts", async () => {
    mockPost.mockRejectedValue(offline());

    await expect(uploadFile(small, "visits")).rejects.toThrow("Network Error");
    expect(mockPost).toHaveBeenCalledTimes(3);
  }, 20_000);

  // Re-sending identical bytes the server already looked at and refused just
  // burns the agent's connection and delays the error they need to see.
  it("does not retry once the server has refused the file", async () => {
    mockPost.mockRejectedValue(refused("Расширение bmp не разрешено"));

    await expect(uploadFile(small, "shops")).rejects.toThrow("Расширение bmp не разрешено");
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  // Better to say so up front than to spend a minute uploading a body the
  // server will reject on arrival.
  it("refuses an oversized photo without contacting the server", async () => {
    mockPost.mockResolvedValue(ok());

    await expect(uploadFile(payload(MAX_UPLOAD_BYTES + 500_000), "shops"))
      .rejects.toThrow(/слишком большое/);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ── Every picked image must go through S3 ────────────────────────────────────
//
// The avatar screen used to send assets[0].uri straight to updateProfile, so a
// local path like file:///.../ImagePicker/x.jpeg was stored in the users table.
// It rendered on the agent's own phone until the cache was swept and was a
// broken image everywhere else, including the office dashboard — the kind of
// failure nobody reports because on the device that set it, it looks fine.
describe("image screens", () => {
  const screens = [
    "app/(tabs)/profile.tsx",
    "app/shop/new.tsx",
    "app/shop/[id].tsx",
    "app/merchandiser/visit.tsx",
    "src/components/plans/AgentPlansView.tsx",
  ];

  it.each(screens)("%s uploads the image rather than storing a device path", (screen) => {
    const src = readFileSync(resolve(__dirname, "../..", screen), "utf8");

    expect(src).toContain("uploadFile(");
    // The picker only fills `base64` when asked to, so its presence is also
    // what proves the screen isn't relying on the local uri.
    expect(src).toMatch(/base64:\s*true/);
    expect(src).not.toMatch(/mutate\(\s*\{\s*avatar:\s*\w+\.assets\[0\]\.uri/);
  });
});
