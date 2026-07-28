import { StudentLogin } from './StudentLogin';

export const metadata = { title: 'دخول الطلاب — سجل الأعمال' };

export default async function JoinPage({ params }) {
  const { slug } = await params;
  return <StudentLogin slug={slug} />;
}
