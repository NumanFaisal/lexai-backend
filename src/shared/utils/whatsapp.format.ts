// src/shared/utils/whatsapp.format.ts

export class WhatsAppFormatter {
  /**
   * Converts standard Markdown to WhatsApp supported formatting.
   * WhatsApp supports: *bold*, _italics_, ~strikethrough~, ```code```
   */
  static formatForWhatsApp(text: string): string {
    if (!text) return '';

    return text
      // 1. Convert Markdown Bold (**text**) to WhatsApp Bold (*text*)
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      
      // 2. Convert Headers (### Header) to WhatsApp Bold (*Header*)
      .replace(/^#{1,6}\s*(.*)$/gm, '*$1*')
      
      // 3. Convert standard Links [text](url) to "text (url)"
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)')
      
      // 4. Remove unnumbered bullet points (-) and replace with standard bullet (•)
      .replace(/^[-+*]\s+/gm, '• ')
      
      // 5. Remove horizontal lines
      .replace(/^---+$/gm, '')
      .replace(/^===+$/gm, '')
      
      // 6. Clean up excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}