import { describe, expect, it } from "vitest";
import { parseProviderJson, quoteLongIds } from "./json";

describe("parseProviderJson", () => {
  it("keeps a 64 bit id exact where JSON.parse would round it", () => {
    const text = '{"data":{"id":18446744073709551615,"amount":100}}';
    expect(JSON.parse(text).data.id).not.toBe("18446744073709551615");
    expect(parseProviderJson(text)).toEqual({ data: { id: "18446744073709551615", amount: 100 } });
  });

  it("leaves short ids as numbers", () => {
    expect(parseProviderJson('{"data":{"id":4099260516}}')).toEqual({ data: { id: 4099260516 } });
  });

  it("handles ids followed by a comma, brace or bracket and any spacing", () => {
    expect(parseProviderJson('{"id" : 1234567890123456 ,"x":1}')).toEqual({ id: "1234567890123456", x: 1 });
    expect(parseProviderJson('[{"id":1234567890123456}]')).toEqual([{ id: "1234567890123456" }]);
  });

  it("does not touch long numbers under other keys", () => {
    expect(parseProviderJson('{"amount":12345678901234567}')).toEqual({ amount: 12345678901234567 });
  });

  it("does not rewrite text inside a string value", () => {
    const text = '{"message":"the \\"id\\": 1234567890123456 was used"}';
    expect(quoteLongIds(text)).toBe(text);
    expect(parseProviderJson(text)).toEqual({ message: 'the "id": 1234567890123456 was used' });
  });

  it("returns null for invalid JSON, empty text and HTML", () => {
    expect(parseProviderJson("")).toBeNull();
    expect(parseProviderJson("<html>502</html>")).toBeNull();
    expect(parseProviderJson("{")).toBeNull();
  });
});
