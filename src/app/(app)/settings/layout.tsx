import { SettingsTabs } from "./tabs";
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <><div className="page-head"><div><h1>Settings</h1><p>Administration, ventures, research configuration, integrations and data.</p></div></div><SettingsTabs />{children}</>;
}
