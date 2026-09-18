// pngjs приходит транзитивно (без @types); тесту нужен только синхронный разбор.
declare module "pngjs" {
  export class PNG { width: number; height: number; data: Buffer; static sync: { read(buf: Buffer): PNG } }
}
