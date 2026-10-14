import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AuthenticatedRequest,
  AuthenticatedUser
} from "../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RewardsDatabase } from "./rewards.database.js";

@Injectable()
export class RewardsAccessService {
  constructor(
    @Inject(RewardsDatabase) private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>
  ) {}

  async canManage(user: AuthenticatedUser): Promise<boolean> {
    if (user.role === "ADMIN") return true;
    const ids = (this.config.get("DOTA_BOT_ADMIN_IDS", { infer: true }) ?? "")
      .split(/[,\s]+/)
      .filter((id) => /^[1-9]\d{0,19}$/.test(id));
    if (!ids.length) return false;
    // The identity belongs to the authenticated account, never to a supplied ID.
    const identity = await this.prisma.userAuthIdentity.findFirst({
      where: { userId: user.id, provider: "telegram", providerUserId: { in: ids } },
      select: { id: true }
    });
    return identity !== null;
  }
}

@Injectable()
export class RewardsAdminGuard implements CanActivate {
  constructor(private readonly access: RewardsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !(await this.access.canManage(user))) {
      throw new ForbiddenException("Нужны права администратора наград");
    }
    return true;
  }
}
