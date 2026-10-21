import { SIGNED_OUT } from '../support/env.ts';
import {
  captureScreenshot,
  captureTiles,
  expect,
  test,
} from '../support/fixtures.ts';

const sections = [
  'Typography',
  'Colour tokens',
  'Accordion',
  'Alert',
  'Alert dialog',
  'Avatar',
  'Badge',
  'Button',
  'Button group',
  'Card',
  'Checkbox',
  'Collapsible',
  'Dialog',
  'Drawer',
  'Dropdown menu',
  'Empty',
  'Field',
  'Input',
  'Input group',
  'Item',
  'Kbd',
  'Label',
  'Popover',
  'Progress',
  'Radio group',
  'Scroll area',
  'Select',
  'Separator',
  'Sheet',
  'Skeleton',
  'Spinner',
  'Switch',
  'Table',
  'Tabs',
  'Textarea',
  'Toast',
  'Toggle',
  'Toggle group',
  'Tooltip',
];

test.use({ storageState: SIGNED_OUT });

test('showcase renders every section', async ({ page }) => {
  await page.goto('/showcase');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Component showcase' }),
  ).toBeVisible();
  for (const name of sections) {
    await expect(
      page.getByRole('region', { name, exact: true }),
    ).toBeAttached();
    await expect(
      page.getByRole('heading', { level: 2, name, exact: true }),
    ).toBeAttached();
  }
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex',
  );
});

test('showcase light', async ({ page }) => {
  await page.goto('/showcase');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await captureTiles(page, 'showcase-light');
});

test('showcase dark', async ({ page }) => {
  await page.goto('/showcase');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await captureTiles(page, 'showcase-dark');
});

test('showcase dialog', async ({ page }) => {
  await page.goto('/showcase');
  await page.getByRole('button', { name: 'Open dialog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('Summer EP');
  await captureScreenshot(page, 'showcase-dialog', { fullPage: false });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
