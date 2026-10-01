import { ImportOutlined, TeamOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

export default function AccessSectionTabs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeKey = pathname === '/clients' ? '/clients' : '/inbounds';

  return (
    <Tabs
      activeKey={activeKey}
      size="small"
      items={[
        {
          key: '/inbounds',
          label: t('menu.inbounds'),
          icon: <ImportOutlined />,
        },
        {
          key: '/clients',
          label: t('menu.clients'),
          icon: <TeamOutlined />,
        },
      ]}
      onChange={(key) => navigate(key)}
      style={{ marginBottom: 8 }}
    />
  );
}
