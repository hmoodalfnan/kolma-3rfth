import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcelJS from 'exceljs';
import { ImportWizard } from '@/app/(manage)/students/ImportWizard';

const groups = [{ id: 'g1', name: 'غرفة 101' }];

async function upload(rows, header = ['الاسم', 'المجموعة', 'الجوال', 'الرمز']) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلاب');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  const buffer = await wb.xlsx.writeBuffer();

  const file = new File([buffer], 'students.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  // jsdom's File stops at the constructor; the component reads the bytes.
  file.arrayBuffer = async () => buffer;
  return file;
}

function setup() {
  const onImport = vi.fn(async ({ students }) => ({
    created: students.map((s) => ({ id: s.full_name, full_name: s.full_name, tempPin: '111111' })),
  }));
  const view = render(
    <ImportWizard
      groups={groups}
      scheduleName="رحلة الصيف"
      onImport={onImport}
      onCancel={() => {}}
    />,
  );
  return { ...view, onImport, user: userEvent.setup() };
}

const fileInput = (container) => container.querySelector('#impfile');
const importButton = () => screen.getByRole('button', { name: /إضافة \d+ طالباً/ });

// The file is read asynchronously, so the review panel arrives a tick later.
const settle = () => screen.findByRole('button', { name: /إضافة \d+ طالباً/ });

describe('ImportWizard review', () => {
  it('lists the broken rows above everything else', async () => {
    const { container, user } = setup();
    await user.upload(
      fileInput(container),
      await upload([
        ['محمد علي', 'غرفة 101', '12345678', ''],
        ['أحمد محمود', 'غرفة 101', '', '12'],
      ]),
    );
    await settle();

    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toMatch(/أحمد محمود/);
    expect(screen.getByText(/الرمز يجب أن يكون 6 أرقام/)).toBeTruthy();
  });

  it('imports the good rows and leaves the broken one behind', async () => {
    const { container, user, onImport } = setup();
    await user.upload(
      fileInput(container),
      await upload([
        ['محمد علي', 'غرفة 101', '12345678', ''],
        ['', 'غرفة 101', '12345679', ''],
      ]),
    );
    await settle();

    await user.click(importButton());

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toMatchObject({
      groupId: 'g1',
      students: [{ full_name: 'محمد علي' }],
    });
  });

  it('lets the admin repair a row in place instead of re-importing the file', async () => {
    const { container, user, onImport } = setup();
    await user.upload(
      fileInput(container),
      await upload([['', 'غرفة 101', '12345678', '482913']]),
    );
    await settle();

    expect(importButton().textContent).toMatch(/إضافة 0 طالباً/);

    await user.click(screen.getByRole('button', { name: 'إصلاح' }));
    await user.type(screen.getByLabelText('الاسم'), 'خالد سعد');

    expect(screen.queryByText('الاسم مطلوب')).toBeNull();
    await user.click(importButton());

    expect(onImport.mock.calls[0][0].students).toEqual([
      { full_name: 'خالد سعد', pin: '482913' },
    ]);
  });

  it('asks about a one-word name without blocking it', async () => {
    const { container, user, onImport } = setup();
    await user.upload(fileInput(container), await upload([['محمد', 'غرفة 101', '', '']]));
    await settle();

    expect(screen.getByText(/كلمة واحدة/)).toBeTruthy();
    expect(importButton().textContent).toMatch(/إضافة 1 طالباً/);

    await user.click(importButton());
    expect(onImport.mock.calls[0][0].students).toEqual([{ full_name: 'محمد' }]);
  });

  it('drops a row the admin decides against', async () => {
    const { container, user } = setup();
    await user.upload(
      fileInput(container),
      await upload([
        ['محمد علي', 'غرفة 101', '', ''],
        ['أحمد محمود', 'غرفة 101', '', ''],
      ]),
    );
    await settle();

    await user.click(screen.getAllByRole('button', { name: /^حذف/ })[0]);

    expect(importButton().textContent).toMatch(/إضافة 1 طالباً/);
  });

  it('sends one call per group so each student lands where the file put them', async () => {
    const twoGroups = [...groups, { id: 'g2', name: 'غرفة 102' }];
    const onImport = vi.fn(async ({ students }) => ({ created: students }));
    const { container } = render(
      <ImportWizard
        groups={twoGroups}
        scheduleName="رحلة الصيف"
        onImport={onImport}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();

    await user.upload(
      fileInput(container),
      await upload([
        ['محمد علي', 'غرفة 101', '', ''],
        ['أحمد محمود', 'غرفة 102', '', ''],
        ['سعد خالد', '', '', ''],
      ]),
    );
    await settle();
    await user.click(importButton());

    expect(onImport.mock.calls.map(([payload]) => payload.groupId)).toEqual(['g1', 'g2', null]);
  });
});
