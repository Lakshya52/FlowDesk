import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  PhoneCall,
  ClipboardList,
  ScrollText,
  CalendarClock,
  MapPin,
} from "lucide-react";
import CrmDashboard from './CrmDashboard';
import Campaigns from './Campaigns';
import DialQueue from './DialQueue';
// import Plan from './Plan';
import CrmLogs from './CrmLogs';
import Schedule from './Schedule';
import Summary from './Summary';
import FieldVisits from './FieldVisits';

const SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    component: CrmDashboard,
    description: "CRM overview & key metrics",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: <Megaphone size={18} />,
    component: Campaigns,
    description: "Manage and track campaigns",
  },
  {
    id: "dial",
    label: "Dial Queue",
    icon: <PhoneCall size={18} />,
    component: DialQueue,
    description: "Outbound calling queue",
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: <CalendarClock size={18} />,
    component: Schedule,
    description: "Upcoming follow-ups & meetings",
  },
  // {
  //   id: "plan",
  //   label: "Plan",
  //   icon: <ClipboardList size={18} />,
  //   component: Plan,
  //   description: "Planning & strategy",
  // },
  {
    id: "summary",
    label: "Summary",
    icon: <ClipboardList size={18} />,
    component: Summary,
    description: "Generate your summaries",
  },
  {
    id: "logs",
    label: "Logs",
    icon: <ScrollText size={18} />,
    component: CrmLogs,
    description: "Campaign & lead activity logs",
  },
  {
    id: "field-visits",
    label: "Field Visits",
    icon: <MapPin size={18} />,
    component: FieldVisits,
    description: "Manage field visits with geo-tagged selfies & live tracking",
  },
];

const CrmPage = (): React.JSX.Element => {
  const { section } = useParams<{ section: string }>();
  const activeSection = section || "dashboard";
  const activeSectionData = SECTIONS.find((s) => s.id === activeSection);
  const ActiveComponent = activeSectionData?.component || CrmDashboard;

  useEffect(() => {
    document.getElementById("main-content-scroll")?.scrollTo(0, 0);
  }, [activeSection]);

  return (
    <div className="h-full bg-(--color-bg)">
      {/* <div className="bg-surface border-b border-border top-0 z-30 card rounded-2xl px-4 sm:px-8 lg:px-16 py-6 sm:py-10">
        <div
          className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8"
          style={{ padding: "20px" }}
        >
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-text tracking-tight flex items-center gap-4">
              <div className="">
                {activeSectionData?.icon
                  ? React.cloneElement(
                      activeSectionData.icon as React.ReactElement
                    )
                  : null}
              </div>
              CRM — {activeSectionData?.label || "Dashboard"}
            </h1>
            <p className="text-base text-text-secondary mt-2 font-medium">
              {activeSectionData?.description || "Customer relationship management"}
            </p>
          </div>
        </div>
      </div> */}

      {/* <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 mt-6 sm:mt-8"> */}
        <div className="animate-fade-in" key={activeSection}>
          <ActiveComponent />
        </div>
      {/* </div> */}
    </div>
  );
};

export default CrmPage;
