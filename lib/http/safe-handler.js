import { jsonResponse } from './request-context';

/**
 * Wraps a route handler so an uncaught throw becomes a JSON 500 instead of an
 * empty response body. An empty 500 is invisible to the client: `res.json()`
 * rejects, and the UI reports it as a network failure, which sends everyone
 * looking at their wifi instead of at the server.
 *
 * The real error is logged for the platform's function logs; the client only
 * ever sees a generic Arabic message, never a stack trace or a config value.
 */
export function safeHandler(name, handler) {
  return async function wrapped(request, context) {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error(`[${name}] unhandled error:`, error?.message, error?.stack);

      const misconfigured = /is not configured|supabaseUrl is required|supabaseKey is required/i.test(
        error?.message ?? '',
      );

      return jsonResponse(
        {
          error: misconfigured
            ? 'إعدادات الخادم غير مكتملة. راجع متغيّرات البيئة في Vercel.'
            : 'حدث خطأ في الخادم، حاول مرة أخرى',
          code: misconfigured ? 'server_misconfigured' : 'server_error',
        },
        500,
      );
    }
  };
}
