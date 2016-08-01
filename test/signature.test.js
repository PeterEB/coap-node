var expect = require('chai').expect,
    SmartObject = require('smartobject'); 

var CoapNode = require('../index');

var so = new SmartObject(),
    node = new CoapNode('utNode', so);

describe('Signature Check', function () {
    describe('setDevAttrs', function () {
        it('should throw TypeError if attrs is not a number', function () {
            expect(function () { return node.setDevAttrs(); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(undefined); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(null); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(NaN); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(100); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs('xx'); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs([]); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(true); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(new Date()); }).to.throw(TypeError);
            expect(function () { return node.setDevAttrs(function () {}); }).to.throw(TypeError);

            expect(function () { return node.setDevAttrs({}); }).not.to.throw(TypeError);
        });
    });

    describe('register', function () {
        it('should throw TypeError if ip is not a string', function () {
            expect(function () { return node.register(); }).to.throw(TypeError);
            expect(function () { return node.register(undefined, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(null, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(NaN, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(100, '1'); }).to.throw(TypeError);
            expect(function () { return node.register([], '1'); }).to.throw(TypeError);
            expect(function () { return node.register({}, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(true, '1'); }).to.throw(TypeError);
            expect(function () { return node.register(new Date(), '1'); }).to.throw(TypeError);
            expect(function () { return node.register(function () {}, '1'); }).to.throw(TypeError);
        });

        it('should throw TypeError if ip is not a string or a number', function () {
            expect(function () { return node.register('192.168.1.1'); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', undefined); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', null); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', NaN); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', []); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', {}); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', true); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', new Date()); }).to.throw(TypeError);
            expect(function () { return node.register('192.168.1.1', function () {}); }).to.throw(TypeError);
        });
    });
});