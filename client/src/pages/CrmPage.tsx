import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Handshake,
  PhoneCall,
  ClipboardList,
  ScrollText,
  CalendarClock,
  BadgeCheck,
  MapPin,
} from "lucide-react";
import CrmDashboard from "../components/crm/CrmDashboard";
import LeadsOverview from "../components/crm/LeadsOverview";
import Databases from "../components/crm/Databases";
import Partners from "../components/crm/Partners";
import DialQueue from "../components/crm/DialQueue";
import Files from "../components/crm/Files";
import ConversionsOverview from "../components/crm/ConversionsOverview";
import DocsStructure from "../components/crm/DocsStructure";
// import Plan from "../components/crm/Plan";
import CrmLogs from "../components/crm/CrmLogs";
import Schedule from "../components/crm/Schedule";
import Summary from "../components/crm/Summary";
import FieldVisits from "../components/crm/FieldVisits";

const SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    component: CrmDashboard,
    description: "CRM overview & key metrics",
  },
  {
    id: "databases",
    label: "Databases",
    icon: <Megaphone size={18} />,
    component: Databases,
    description: "Manage and track databases",
  },
  {
    id: "partners",
    label: "Partners",
    icon: <Handshake size={18} />,
    component: Partners,
    description: "Manage and track partners",
  },
  {
    id: "dial",
    label: "Dial Queue",
    icon: <PhoneCall size={18} />,
    component: DialQueue,
    description: "Outbound calling queue",
  },
  {
    id: "files",
    label: "Files",
    icon: <BadgeCheck size={18} />,
    component: Files,
    description: "Loan files, document checklists & closure",
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
    description: "Database & lead activity logs",
  },
  {
    id: "field-visits",
    label: "Field Visits",
    icon: <MapPin size={18} />,
    component: FieldVisits,
    description: "Manage field visits with geo-tagged selfies & live tracking",
  },
];

// Sub-pages that live one level deeper, e.g. /crm/dial/leads-overview.
// They reuse existing components — no separate pages are created.
const SUBSECTIONS: Record<string, Record<string, React.ComponentType>> = {
  dial: {
    "leads-overview": LeadsOverview,
  },
  files: {
    overview: ConversionsOverview,
    "docs-structure": DocsStructure,
  },
};

const CrmPage = (): React.JSX.Element => {
  const { section, subsection } = useParams<{
    section: string;
    subsection?: string;
  }>();
  const activeSection = section || "dashboard";
  const activeSectionData = SECTIONS.find((s) => s.id === activeSection);
  const subsectionComponent = subsection
    ? SUBSECTIONS[activeSection]?.[subsection]
    : undefined;
  const ActiveComponent =
    subsectionComponent || activeSectionData?.component || CrmDashboard;
  const viewKey = subsection
    ? `${activeSection}/${subsection}`
    : activeSection;

  useEffect(() => {
    document.getElementById("main-content-scroll")?.scrollTo(0, 0);
  }, [viewKey]);

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
        <div className="animate-fade-in" key={viewKey}>
          <ActiveComponent />
        </div>
      {/* </div> */}
    </div>
  );
};

export default CrmPage;
