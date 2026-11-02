package dev.slimevr.websocketapi

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WebsocketAPITests {

	@Test
	fun `test listen address is loopback unless remote access is enabled`() {
		val local = WebsocketAPI.listenAddress(false)
		assertTrue(local.address.isLoopbackAddress)
		assertEquals(21110, local.port)

		val remote = WebsocketAPI.listenAddress(true)
		assertTrue(remote.address.isAnyLocalAddress)
		assertEquals(21110, remote.port)
	}

	@Test
	fun `test origin check allows native clients and local webviews only`() {
		// Native clients send no Origin header
		assertTrue(WebsocketAPI.isAllowedOrigin(null))
		assertTrue(WebsocketAPI.isAllowedOrigin(""))

		assertTrue(WebsocketAPI.isAllowedOrigin("tauri://localhost"))
		assertTrue(WebsocketAPI.isAllowedOrigin("http://tauri.localhost"))
		assertTrue(WebsocketAPI.isAllowedOrigin("http://localhost:5173"))
		assertTrue(WebsocketAPI.isAllowedOrigin("http://127.0.0.1:21110"))
		assertTrue(WebsocketAPI.isAllowedOrigin("http://[::1]:5173"))

		assertFalse(WebsocketAPI.isAllowedOrigin("https://evil.example"))
		assertFalse(WebsocketAPI.isAllowedOrigin("http://localhost.evil.example"))
		assertFalse(WebsocketAPI.isAllowedOrigin("null"))
		assertFalse(WebsocketAPI.isAllowedOrigin("http://[bad"))
	}
}
