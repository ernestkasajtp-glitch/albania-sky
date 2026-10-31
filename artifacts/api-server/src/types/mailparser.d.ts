// Deklarim minimal — paketa "mailparser" s'ka tipe të veta dhe @types/mailparser
// nuk është i instaluar. Mjafton për simpleParser(source) → { subject, html, text, date, attachments }.
declare module "mailparser" {
  export interface MailAttachment {
    contentId?: string;
    contentType?: string;
    content?: Buffer;
    [key: string]: unknown;
  }
  export interface ParsedMail {
    subject?: string;
    html?: string | false;
    text?: string;
    date?: Date;
    from?: { text?: string; value?: { address?: string; name?: string }[] };
    attachments?: MailAttachment[];
    [key: string]: unknown;
  }
  export function simpleParser(source: Buffer | string): Promise<ParsedMail>;
}
