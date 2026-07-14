// import { Download, ShieldCheck } from "lucide-react"
import { Download } from "lucide-react"
import { Link } from "react-router-dom"

const linkGroups = [
  {
    title: "PRODUCT",
    links: [
      "Watch demo",
      "Pricing",
      "Paid vs Free",
      "Accessibility",
      "Featured releases",
      "Change log",
      "Status",
    ],
  },
  {
    title: "WHY FLOWDESK?",
    links: [
      "FlowDesk vs Jira",
      "FlowDesk vs Slack",
      "Enterprise Edition features",
      "For Small business",
      "Productivity",
      "Task management",
      // "Scale",
      // "Trust",
    ],
  },
  {
    title: "FEATURES",
    links: [
      "Project Management",
      "Task / Kanban Management",
      "Task / Kanban Management",
      // "Channels",
      // "FlowDesk Connect",
      // "Workflow Builder",
      "Messaging",
      // "Huddles",
      "Canvas",
      // "Lists",
      // "Clips",
      // "Apps & integrations",
      "File sharing",
      // "FlowDesk AI",
      // "Agentforce",
      // "Enterprise search",
      // "Security",
      // "Enterprise Key Management",
      // "FlowDesk Atlas",
      "See all features",
    ],
  },
  {
    title: "SOLUTIONS",
    links: [
      "Engineering",
      "IT",
      "Customer service",
      "Sales",
      "Project management",
      "Marketing",
      "Security",
      "Manufacturing auto and energy",
      "Technology",
      "Media",
      "Financial services",
      "Retail",
      "Public sector",
      "Education",
      "Health and life sciences",
      "See all solutions",
    ],
  },
  {
    title: "RESOURCES",
    links: [
      "Help Centre",
      "What's new",
      "Resources library",
      "FlowDesk blog",
      "Community",
      "Customer stories",
      "Events",
      "Developers",
      "Partner programme",
      "Partner offers",
      "FlowDesk Marketplace",
      "FlowDesk Certified",
    ],
  },
  {
    title: "COMPANY",
    links: [
      "About us",
      "News",
      "Media kit",
      "Brand centre",
      "Careers",
      "FlowDesk shop",
      "Engineering blog",
      "Design blog",
      "Contact us",
    ],
  },
]

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-bold tracking-[0.08em] text-[#1D1C1D] uppercase mb-4 font-manrope-bold">
    {children}
  </h3>
)

const LinkList = ({ items }: { items: string[] }) => (
  <ul className="flex flex-col gap-1.5 font-manrope">
    {items.map((item) => (
      <li key={item}>
        <a
          href="#"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline transition-colors"
        >
          {item}
        </a>
      </li>
    ))}
  </ul>
)

export default function Footer() {
  return (
    <footer className=" font-sans w-[90dvw] sm:w-[80vw] md:w-[75vw] mx-auto border-t border-gray-200">
      <div className="px-16 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-10">
          {/* Column 1: Logo */}
          <div>
            <Link to="/" className="inline-block text-[#0a0038] font-manrope-bold text-xl tracking-tight">
              {/* <FlowDeskLogo /> */}
              FlowDesk
            </Link>
          </div>

          {/* Column 2: PRODUCT + WHY FLOWDESK? */}
          <div className="flex flex-col gap-8">
            <div>
              <SectionHeading>PRODUCT</SectionHeading>
              <LinkList items={linkGroups[0].links} />
            </div>
            <div>
              <SectionHeading>WHY FLOWDESK?</SectionHeading>
              <LinkList items={linkGroups[1].links} />
            </div>
          </div>

          {/* Column 3: FEATURES */}
          <div>
            <SectionHeading>FEATURES</SectionHeading>
            <LinkList items={linkGroups[2].links} />
          </div>

          {/* Column 4: SOLUTIONS */}
          <div>
            <SectionHeading>SOLUTIONS</SectionHeading>
            <LinkList items={linkGroups[3].links} />
          </div>

          {/* Column 5: RESOURCES */}
          <div>
            <SectionHeading>RESOURCES</SectionHeading>
            <LinkList items={linkGroups[4].links} />
          </div>

          {/* Column 6: COMPANY */}
          <div>
            <SectionHeading>COMPANY</SectionHeading>
            <LinkList items={linkGroups[5].links} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-16 border-t border-gray-200" />

      {/* Bottom Bar */}
      <div className="px-16 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 font-manrope">
          <a href="#" className="flex items-center gap-1.5 text-[#611F69] hover:text-[#4A154B] font-medium transition-colors">
            <Download size={14} />
            Download FlowDesk
          </a>
          <span className="hidden md:inline text-gray-300">·</span>
          <a href="#" className="hover:underline">Privacy</a>
          <span className="text-gray-300">·</span>
          <a href="#" className="hover:underline">Terms</a>
          <span className="text-gray-300">·</span>
          <a href="#" className="hover:underline">Cookie preferences</a>
          <span className="text-gray-300">·</span>
          <a href="#" className="flex items-center gap-1 hover:underline">Your privacy choices </a>
        </div>
        <p className="text-xs text-gray-500 md:text-right">
          &copy; 2026 FlowDesk, Inc. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
