import { pageApi, type CmsPage } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { pageHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'title', label: 'Title', type: 'text' },
  { name: 'content', label: 'Content', type: 'textarea', showInTable: false },
  { name: 'isPublished', label: 'Published', type: 'boolean', required: false, defaultValue: true },
];

export default function PagesPage() {
  return (
    <ConfigEntityPage<CmsPage>
      title="Pages"
      resource="cms"
      hooks={pageHooks}
      fields={fields}
      api={pageApi}
      hasActiveToggle={false}
    />
  );
}
