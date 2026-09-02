import { TargetUserQueryDto } from '../../common/dto/target-user.dto';

/** Sin `userId` es el progreso de quien llama; con él, el de ese cliente. */
export class ProgressQueryDto extends TargetUserQueryDto {}
