import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'audit_events', versionKey: false })
export class AuditEvent {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true, index: true })
  type!: string;

  @Prop({ required: true, index: true })
  aggregateId!: string;

  @Prop({ index: true })
  correlationId!: string;

  @Prop()
  traceId!: string;

  @Prop({ required: true })
  routingKey!: string;

  @Prop({ type: Object })
  payload!: Record<string, unknown>;

  @Prop({ required: true, index: true })
  occurredAt!: Date;

  @Prop({ required: true })
  receivedAt!: Date;
}

export type AuditEventDocument = HydratedDocument<AuditEvent>;
export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
