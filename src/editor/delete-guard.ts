import type { Ref } from '@/model/references';

/**
 * Deleting things rules depend on goes through here so the user can be warned
 * which rules will break (edge case "A Kind used by rules is deleted"). The
 * DeleteConfirm dialog installs `request`; until it is mounted, deletes run
 * straight away.
 */
export const DELETE_GUARD: { request: (ref: Ref, doDelete: () => void) => void } = {
  request: (_ref, doDelete) => doDelete(),
};
