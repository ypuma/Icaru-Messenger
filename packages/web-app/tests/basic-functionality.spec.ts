import { test, expect } from '@playwright/test';

test.describe('Basic Application Functionality', () => {
  test('should load the application without errors', async ({ page }) => {
    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to the application
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Should not have any console errors
    expect(consoleErrors).toHaveLength(0);

    // Should show the main interface
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display account creation interface by default', async ({ page }) => {
    await page.goto('/');
    
    // Should show account creation heading
    await expect(page.locator('h1, h2, h3')).toContainText(/Create|Account|Setup/);
    
    // Page should be interactive
    const interactiveElements = page.locator('button, input, [role="button"]');
    const count = await interactiveElements.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should have working backend API', async ({ page }) => {
    await page.goto('/');
    
    // Test handle availability check
    const response = await page.request.post('http://79.255.198.124:3001/api/auth/check-handle', {
      data: { handle: 'TST-123' }
    });
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('available');
    expect(data).toHaveProperty('handle', 'TST-123');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Test with invalid handle format
    const response = await page.request.post('http://79.255.198.124:3001/api/auth/check-handle', {
      data: { handle: 'invalid' }
    });
    
    expect(response.status()).toBe(400);
  });

  test('should have responsive design', async ({ page }) => {
    await page.goto('/');
    
    // Test desktop view
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('body')).toBeVisible();
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    
    // Content should still be accessible
    await expect(page.locator('h1, h2, h3')).toBeVisible();
  });

  test('should have proper page metadata', async ({ page }) => {
    await page.goto('/');
    
    // Should have a title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should handle navigation properly', async ({ page }) => {
    await page.goto('/');
    
    // Should be on the correct URL
    expect(page.url()).toContain('79.255.198.124:5173');
    
    // Page should be loaded
    await expect(page.locator('html')).toBeVisible();
  });
}); 