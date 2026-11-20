const dns = require('node:dns/promises');
const net = require('node:net');
const { validateTargetUrl } = require('../services/webAnalyzerService');
const { AppError } = require('../utils/http');

// Private staging is opt-in, but browser control services and infrastructure
// metadata are never legitimate target destinations, even with that opt-in.
async function validateBrowserUrl(rawUrl) {
  const url = await validateTargetUrl(rawUrl);
  if (['3100', '3101'].includes(url.port)) throw new AppError('Cổng điều khiển trình duyệt không phải website kiểm thử.', 403);
  const addresses = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true, verbatim: true });
  const blocked = addresses.some(({ address }) => {
    const ip = address.toLowerCase().replace(/^::ffff:/, '');
    return /^127\./.test(ip) || /^169\.254\./.test(ip) || ip === '0.0.0.0' || ip === '100.100.100.200' || ip === '::1' || /^fe[89ab]/.test(ip) || ip === 'fd00:ec2::254';
  });
  if (blocked) throw new AppError('Địa chỉ loopback hoặc metadata không được dùng cho Manual Browser.', 403);
  return url;
}
module.exports = { validateBrowserUrl };
