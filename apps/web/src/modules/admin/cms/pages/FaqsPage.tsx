import { faqApi, type Faq } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { faqHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'question', label: 'Question', type: 'text' },
  { name: 'answer', label: 'Answer', type: 'textarea' },
  { name: 'category', label: 'Category', type: 'text', required: false, defaultValue: 'general' },
  { name: 'order', label: 'Order', type: 'number', required: false, defaultValue: 0 },
];

export default function FaqsPage() {
  return (
    <ConfigEntityPage<Faq> title="FAQs" resource="cms" hooks={faqHooks} fields={fields} api={faqApi} />
  );
}
