// Minimal ambient type declarations for vendor packages that ship no types
// and have no published `@types/*` package resolvable in this project's
// dependency tree at this plan's execution time (03-04). Declared locally
// per the compiler's own suggested fix rather than adding a new npm
// dependency — narrowed to only the surface `src/gmail/fetch.ts` actually
// uses.

declare module "mailparser" {
  export interface AddressObject {
    text: string;
  }

  export interface ParsedMail {
    from?: AddressObject;
    subject?: string;
    date?: Date;
    text?: string;
    html?: string | false;
  }

  export function simpleParser(source: string | Buffer): Promise<ParsedMail>;
}

declare module "html-to-text" {
  export function convert(html: string, options?: Record<string, unknown>): string;
}
