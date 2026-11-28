import { accessOperations } from '../../access/src/operations.ts';
import { briefOperations } from '../../brief/src/operations.ts';
import { linksOperations } from '../../links/src/links.ts';
import { peopleOperations } from '../../people/src/people.ts';
import { storeOperations } from '../../store/src/operations.ts';
import type { Operation } from '../../../contracts/operation.ts';

// The operations list. The screen's buttons, the commands and the agent tools
// are all made from it. Each part describes its own operations, and a later
// piece adds its part's list here.
export const operationList: readonly Operation[] = [
  ...accessOperations,
  ...storeOperations,
  ...briefOperations,
  ...linksOperations,
  ...peopleOperations,
];

export function findOperation(name: string): Operation | undefined {
  return operationList.find((operation) => operation.name === name);
}
