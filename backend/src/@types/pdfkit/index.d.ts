declare module "pdfkit" {
  import { Readable } from "stream";

  type PageMargins = {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  type PageDimensions = {
    width: number;
    height: number;
    margins: PageMargins;
  };

  type PDFDocumentOptions = {
    size?: string | [number, number];
    margin?: number | PageMargins;
  };

  type TextOptions = {
    align?: "left" | "center" | "right" | "justify";
    width?: number;
    continued?: boolean;
    indent?: number;
  };

  type ImageOptions = {
    fit?: [number, number];
    align?: "left" | "center" | "right";
    valign?: "top" | "center" | "bottom";
  };

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);

    // layout
    page: PageDimensions;
    x: number;
    y: number;

    // text & fonts
    font(src: string): this;
    fontSize(size: number): this;
    registerFont(name: string, src: string): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;

    // images
    image(src: string, x?: number, y?: number, options?: ImageOptions): this;

    // drawing
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;

    // layout helpers
    addPage(options?: PDFDocumentOptions): this;
    moveDown(lines?: number): this;

    // events
    on(event: "pageAdded", listener: () => void): this;

    // output
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    end(): void;
  }

  export default PDFDocument;
}
