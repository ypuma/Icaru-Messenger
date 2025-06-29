import { test, expect } from '@playwright/test';

test.describe('Account Creation Flow', () => {
  test('should display the deterministic account generation UI and create an account', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // 1. Verify the initial "generating" state
    await expect(page.getByRole('heading', { name: 'Generating Your Secure Account' })).toBeVisible();

    // 2. Wait for the confirmation step and verify content
    await expect(page.getByRole('heading', { name: 'Your New Account' })).toBeVisible({ timeout: 15000 });

    // Check for the handle
    const handleElement = page.locator('.font-mono.text-3xl');
    await expect(handleElement).toBeVisible();
    const handleText = await handleElement.textContent();
    expect(handleText).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    // Check for the recovery phrase
    const recoveryPhraseElement = page.locator('.font-mono.text-lg');
    await expect(recoveryPhraseElement).toBeVisible();
    const recoveryPhraseText = await recoveryPhraseElement.textContent();
    expect(recoveryPhraseText?.split(' ').length).toBe(12);

    // 3. Confirm and create the account
    const confirmCheckbox = page.getByLabel('I have securely stored my recovery phrase.');
    await confirmCheckbox.check();
    await expect(confirmCheckbox).toBeChecked();

    // The button should be enabled now
    const createButton = page.getByRole('button', { name: 'Create Account' });
    await expect(createButton).toBeEnabled();
    
    // Intercept the API call to ensure it sends the correct data
    await page.route('**/api/auth/create-account', async route => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      
      expect(postData.handle).toEqual(handleText);
      expect(postData.publicKey).toBeDefined();
      expect(postData.preKeyBundle).toBeDefined();

      // Fulfill with a successful response
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          account: { handle: postData.handle, id: 'test-id' }
        })
      });
    });
    
    // Click the create button
    await createButton.click();

    // 4. Verify the storing state and successful creation
    await expect(page.getByRole('heading', { name: 'Securing Your Account' })).toBeVisible();
    
    // After creation, it should redirect or show a success state
    // (This part depends on the app's behavior after onAccountCreated is called)
    // For now, let's assume it navigates away or hides the creation component.
    await expect(page.getByRole('heading', { name: 'Your New Account' })).not.toBeVisible({ timeout: 10000 });
  });
}); 