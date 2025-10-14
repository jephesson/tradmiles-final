import { IComissoesRepo } from "./comissoes.repo";
import { LocalComissoesRepo } from "./comissoes.local";
import { ApiComissoesRepo } from "./comissoes.api";

export function getComissoesRepo(): IComissoesRepo {
  if (process.env.NEXT_PUBLIC_USE_API === "true") {
    return new ApiComissoesRepo();
  }
  return new LocalComissoesRepo();
}
