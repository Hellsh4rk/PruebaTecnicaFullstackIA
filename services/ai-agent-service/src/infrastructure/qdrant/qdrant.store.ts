import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { KnowledgeBase, RetrievedChunk } from '../../application/ports';

@Injectable()
export class QdrantKnowledgeBase implements KnowledgeBase {
  private readonly client: QdrantClient;
  private readonly collection: string;
  private readonly dimensions: number;

  constructor(config: ConfigService) {
    this.client = new QdrantClient({ url: config.getOrThrow<string>('QDRANT_URL') });
    this.collection = config.get<string>('QDRANT_COLLECTION') ?? 'toka_knowledge';
    this.dimensions = Number(config.get('EMBED_DIMENSIONS') ?? 768);
  }

  async ensure(): Promise<void> {
    try {
      await this.client.getCollection(this.collection);
    } catch {
      await this.client.createCollection(this.collection, {
        vectors: { size: this.dimensions, distance: 'Cosine' },
      });
    }
  }

  async count(): Promise<number> {
    const result = await this.client.count(this.collection);
    return result.count;
  }

  async search(vector: number[], limit: number): Promise<RetrievedChunk[]> {
    const result = await this.client.query(this.collection, {
      query: vector,
      limit,
      with_payload: true,
    });
    return (result.points ?? []).map((point) => {
      const payload = (point.payload ?? {}) as { title?: string; text?: string; source?: string };
      return {
        title: payload.title ?? 'sin título',
        text: payload.text ?? '',
        source: payload.source ?? 'desconocido',
        score: point.score ?? 0,
      };
    });
  }

  async upsert(points: Array<{ id: string; vector: number[]; title: string; text: string; source: string }>): Promise<void> {
    await this.client.upsert(this.collection, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: { title: point.title, text: point.text, source: point.source },
      })),
    });
  }
}
