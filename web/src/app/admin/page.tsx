import type { Metadata } from "next";
import AdminEditor from "@/components/AdminEditor";
import Intro from "@/components/Intro";
import { FIELDS } from "@/lib/content";

export const metadata: Metadata = { title: "Edit site · DeepARAM", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <>
      <Intro eyebrow="Editor" title="Edit the site.">
        Change any text below and save. The site shows it in about a minute.
      </Intro>
      <AdminEditor fields={FIELDS} />
    </>
  );
}
