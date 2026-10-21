import { IsUUID } from 'class-validator';

export class AssignmentDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;
}
