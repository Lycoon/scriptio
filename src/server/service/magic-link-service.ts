import { MagicLinkRepository, MagicLinkTokenCreation } from "../repository/magic-link-repository";

const repository = new MagicLinkRepository();

export const sweepExpired = () => repository.deleteExpired();

export const countRecent = (email: string, windowStart: Date) =>
    repository.countRecent(email, windowStart);

export const issue = (data: MagicLinkTokenCreation) => repository.create(data);

export const findByHash = (tokenHash: string) => repository.findByHash(tokenHash);

export const consumeByHash = (tokenHash: string) => repository.deleteByHash(tokenHash);
