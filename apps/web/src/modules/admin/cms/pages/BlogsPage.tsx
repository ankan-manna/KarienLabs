import { blogApi, type Blog } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { blogHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'title', label: 'Title', type: 'text' },
  { name: 'excerpt', label: 'Excerpt', type: 'textarea', required: false, showInTable: false },
  { name: 'content', label: 'Content', type: 'textarea', showInTable: false },
  { name: 'isPublished', label: 'Published', type: 'boolean', required: false, defaultValue: false },
];

export default function BlogsPage() {
  return (
    <ConfigEntityPage<Blog>
      title="Blog Posts"
      resource="cms"
      hooks={blogHooks}
      fields={fields}
      api={blogApi}
      hasActiveToggle={false}
    />
  );
}
