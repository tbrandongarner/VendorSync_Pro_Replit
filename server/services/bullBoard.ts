import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { syncQueue, fileImportQueue, pricingQueue } from './jobQueue';

// Create Bull Board for job monitoring
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullMQAdapter(syncQueue),
    new BullMQAdapter(fileImportQueue),
    new BullMQAdapter(pricingQueue),
  ],
  serverAdapter,
});

export { serverAdapter, addQueue, removeQueue, setQueues, replaceQueues };