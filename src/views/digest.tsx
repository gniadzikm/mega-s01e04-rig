import type { DigestResult } from '../digest/types.js';

export function DigestPage({ result }: { result: DigestResult }) {
  return (
    <>
      <h1>digest · {result.night}</h1>
      {result.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first at</th>
                <th>last at</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr class={row.retries >= 3 && row.lastStatus === 'fail' ? 'warn' : ''}>
                  <td>{row.job}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.badLines > 0 && (
            <p class="mute">{result.badLines} invalid line{result.badLines === 1 ? '' : 's'}</p>
          )}
        </>
      )}
    </>
  );
}
