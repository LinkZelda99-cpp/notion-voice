import { Client } from '@notionhq/client';

export interface NotionBlock {
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'bulleted_list_item' | 'to_do';
  text: string;
  checked?: boolean;
}

export class NotionClient {
  private readonly client: Client;

  constructor(accessToken: string) {
    this.client = new Client({ auth: accessToken });
  }

  async appendBlock(pageId: string, block: NotionBlock): Promise<void> {
    const richText = [
      {
        type: 'text',
        text: { content: block.text }
      }
    ];

    const body = block.type === 'to_do'
      ? {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: richText,
            checked: block.checked ?? false
          }
        }
      : {
          object: 'block',
          type: block.type,
          [block.type]: {
            rich_text: richText
          }
        };

    await this.client.blocks.children.append({
      block_id: pageId,
      children: [body]
    } as Parameters<typeof this.client.blocks.children.append>[0]);
  }

  async search(query: string) {
    return this.client.search({
      query,
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 20
    });
  }

  async getPage(pageId: string) {
    return this.client.pages.retrieve({ page_id: pageId });
  }
}
