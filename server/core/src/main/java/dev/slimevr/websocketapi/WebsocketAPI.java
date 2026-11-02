package dev.slimevr.websocketapi;

import dev.slimevr.VRServer;
import dev.slimevr.protocol.GenericConnection;
import dev.slimevr.protocol.ProtocolAPI;
import dev.slimevr.protocol.ProtocolAPIServer;
import io.eiren.util.logging.LogManager;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.framing.CloseFrame;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;
import org.jetbrains.annotations.NotNull;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;


public class WebsocketAPI extends WebSocketServer implements ProtocolAPIServer {

	static final int PORT = 21110;
	// Hosts a local browser or the Tauri webview (tauri://localhost, http://tauri.localhost) may send as Origin
	private static final Set<String> LOCAL_ORIGIN_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]", "tauri.localhost");

	public final VRServer server;
	public final ProtocolAPI protocolAPI;

	public WebsocketAPI(VRServer server, ProtocolAPI protocolAPI) {
		super(
			listenAddress(server.configManager.getVrConfig().getServer().getWebsocketApiAllowRemote()),
			Collections.singletonList(new Draft_6455())
		);
		this.server = server;
		this.protocolAPI = protocolAPI;

		this.protocolAPI.registerAPIServer(this);
		setReuseAddr(true);
	}

	/**
	 * Loopback only unless remote access was explicitly enabled in the config.
	 */
	static InetSocketAddress listenAddress(boolean allowRemote) {
		if (allowRemote) {
			return new InetSocketAddress(PORT);
		}
		return new InetSocketAddress(InetAddress.getLoopbackAddress(), PORT);
	}

	/**
	 * Native clients send no Origin header, so only browser-originated requests are checked.
	 * Anything else is a web page trying to reach the local API.
	 */
	static boolean isAllowedOrigin(String origin) {
		if (origin == null || origin.isEmpty()) {
			return true;
		}
		try {
			var host = new URI(origin).getHost();
			return host != null && LOCAL_ORIGIN_HOSTS.contains(host);
		} catch (URISyntaxException e) {
			return false;
		}
	}

	@Override
	public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(
		WebSocket conn,
		Draft draft,
		ClientHandshake request
	) throws InvalidDataException {
		var origin = request.getFieldValue("Origin");
		if (!isAllowedOrigin(origin)) {
			LogManager.warning("[WebSocketAPI] Rejected connection from origin: " + origin);
			throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Origin not allowed");
		}
		return super.onWebsocketHandshakeReceivedAsServer(conn, draft, request);
	}

	@Override
	public void onOpen(WebSocket conn, ClientHandshake handshake) {
		LogManager
			.info(
				"[WebSocketAPI] New connection from: "
					+ conn.getRemoteSocketAddress().getAddress().getHostAddress()
			);
		conn.setAttachment(new WebsocketConnection(conn));
	}

	/**
	 * Helper function to get the string of the `conn` while handling `null`
	 */
	protected static String connAddr(WebSocket conn) {
		if (conn == null) {
			return "null";
		}
		var remote = conn.getRemoteSocketAddress();
		if (remote == null) {
			return conn.toString();
		}
		var addr = remote.getAddress();
		if (addr == null) {
			return remote.toString();
		}
		return addr.getHostAddress();
	}

	@Override
	public void onClose(WebSocket conn, int code, String reason, boolean remote) {
		LogManager
			.info(
				"[WebSocketAPI] Disconnected: "
					+ connAddr(conn)
					+ ", ("
					+ code
					+ ") "
					+ reason
					+ ". Remote: "
					+ remote
			);
	}

	@Override
	public void onMessage(WebSocket conn, String message) {
	}

	@Override
	public void onMessage(WebSocket conn, ByteBuffer message) {
		var connection = conn.<WebsocketConnection>getAttachment();
		if (connection != null)
			this.protocolAPI.onMessage(connection, message);
	}

	@Override
	public void onError(WebSocket conn, Exception ex) {
		LogManager
			.severe(
				"[WebSocket] Exception on connection " + connAddr(conn),
				ex
			);
	}

	@Override
	public void onStart() {
		LogManager.info("[WebSocketAPI] Web Socket API started on port " + getPort());
		setConnectionLostTimeout(0);
	}

	@Override
	public @NotNull Stream<GenericConnection> getApiConnections() {
		return this.getConnections().stream().map(conn -> {
			var c = conn.<WebsocketConnection>getAttachment();
			return (GenericConnection) c;
		}).filter(Objects::nonNull);
	}
}
