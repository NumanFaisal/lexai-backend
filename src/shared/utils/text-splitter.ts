/**
 * Simple implementation of RecursiveCharacterTextSplitter
 * since it was removed from the langchain v1.4.x package
 */

interface TextSplitterOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

interface Document {
  pageContent: string;
  metadata?: Record<string, any>;
}

export class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(options: TextSplitterOptions) {
    this.chunkSize = options.chunkSize;
    this.chunkOverlap = options.chunkOverlap;
    this.separators = options.separators || [
      "\n\n",
      "\n",
      " ",
      "",
    ];
  }

  async createDocuments(texts: string[]): Promise<Document[]> {
    const documents: Document[] = [];

    for (const text of texts) {
      const chunks = this.splitText(text);
      for (const chunk of chunks) {
        documents.push({
          pageContent: chunk,
        });
      }
    }

    return documents;
  }

  private splitText(text: string): string[] {
    const finalChunks: string[] = [];
    let goodSeparators: string[] = ["\n\n", "\n", " ", ""];
    let separatorIndex = 0;

    while (separatorIndex < this.separators.length) {
      const separator = this.separators[separatorIndex];
      let splits: string[] = [];

      if (separator) {
        splits = text.split(separator);
      } else {
        splits = text.split("");
      }

      let goodChunks: string[] = [];
      for (const s of splits) {
        if (s.length < this.chunkSize) {
          goodChunks.push(s);
        } else {
          if (goodChunks.length > 0) {
            const mergedText = this.mergeSplits(goodChunks, separator);
            finalChunks.push(...mergedText);
            goodChunks = [];
          }

          const otherInfo = this.splitText(s);
          finalChunks.push(...otherInfo);
        }
      }

      if (goodChunks.length > 0) {
        const mergedText = this.mergeSplits(goodChunks, separator);
        finalChunks.push(...mergedText);
      }

      if (finalChunks.length > 0) {
        break;
      }

      separatorIndex += 1;
    }

    return finalChunks.filter(chunk => chunk.trim().length > 0);
  }

  private mergeSplits(splits: string[], separator: string): string[] {
    const separatorLen = separator.length;
    let goodSplits: string[] = [];

    for (const s of splits) {
      if (s.length < this.chunkSize) {
        goodSplits.push(s);
      } else {
        if (goodSplits.length > 0) {
          const mergedText = goodSplits.join(separator);
          if (mergedText.length < this.chunkSize) {
            goodSplits.push(mergedText);
          } else {
            if (goodSplits.length > 0) {
              const chunk = this.joinDocs(goodSplits, separator);
              return [chunk];
            }
          }
        }
        const chunk = s;
        goodSplits = [chunk];
      }
    }

    if (goodSplits.length > 0) {
      return [this.joinDocs(goodSplits, separator)];
    }

    return [];
  }

  private joinDocs(docs: string[], separator: string): string {
    const text = docs.join(separator).trim();
    return text.length > 0 ? text : "";
  }
}
