# [2.0.0](https://github.com/Dreamystify/fingrprint/compare/v1.0.1...v2.0.0) (2025-09-28)


### Bug Fixes

* add Jest TypeScript config for ES modules ([47b3557](https://github.com/Dreamystify/fingrprint/commit/47b355721ae2e2bcc4c8d771d71e985672c72ea4))
* add Redis to release workflow ([9f9b047](https://github.com/Dreamystify/fingrprint/commit/9f9b047095329e8ebd0d0b0d01fe29c523d37810))
* convert test files to ES module imports ([21e7b4c](https://github.com/Dreamystify/fingrprint/commit/21e7b4c6467c067cbfc6dfec5c828439779e6a0b))
* copy Lua script during build ([f824424](https://github.com/Dreamystify/fingrprint/commit/f8244242d539a3253121b257fb5029a1a05f4319))
* restore original CI test command ([219c723](https://github.com/Dreamystify/fingrprint/commit/219c72384474aa18a7101da466137b4cbb60680b))
* update script loading for ES modules ([ac0b819](https://github.com/Dreamystify/fingrprint/commit/ac0b8195356d0c67b3e35550c974eaee42d6d436))


### Features

* migrate to ES modules with esbuild and semantic-release ([#8](https://github.com/Dreamystify/fingrprint/issues/8)) ([227d499](https://github.com/Dreamystify/fingrprint/commit/227d499dc55f841ba2b9cff55dc9ddcfc0aa9853))


### BREAKING CHANGES

* This is a major version bump as the library now 
exports ES modules instead of CommonJS. Users will need to use 
import statements instead of require() and ensure their projects 
support ES modules.

# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2025-02-26

### Fixed

- **Redis Connection Error Handling**: Improved robustness by adding support for additional host resolution error cases, preventing failures during Redis connection attempts (e.g., DNS-related issues). ([PR #7](https://github.com/Dreamystify/fingrprint/pull/7))

## [1.0.0] - 2025-02-25

### Added

- **ioredis Support:** Migrated from using the `redis` package to `ioredis` to leverage its advanced features.
- **Cluster and Sentinel Modes:**  
  - Added support for Redis Cluster via the `clusterNodes` configuration.
  - Added support for Redis Sentinel via the `sentinels`, `sentinelUsername`, `sentinelPassword`, and `name` options.
- **Extended Configuration Options:**  
  - Updated the `FingrprintConfig` interface to include new options for cluster and Sentinel connections.
  - Added custom retry strategies and reconnection policies.
- **Module Augmentation:** Extended the `ioredis` interfaces to include a new `generateIds` method for generating unique IDs.
- **Enhanced Documentation:** Added detailed JSDoc comments for classes, methods, and events throughout the codebase.

### Changed

- **ID Generation Implementation:**  
  - Refactored the unique ID generation logic to integrate with `ioredis` and support multiple Redis connection modes.
  - The Lua script for generating IDs is now loaded from an external file (`scripts/generateIds.lua`) rather than being hardcoded.
- **Default Constants and Environment Variables:**  
  - Updated naming conventions and default values (e.g., `FINGRPRINT_SHARD_ID_KEY`, `FINGRPRINT_SHARD_ID`) to reflect the new implementation.
- **Error Handling and Event Management:** Improved error detection, handling, and event emissions during initialization and connection processes.

### Fixed

- **Robustness Across Environments:**  
  - Resolved issues related to connection failures and error propagation across different Redis modes.
- **Improved Compatibility:** Ensured that the library behaves consistently whether using a single-node, cluster, or Sentinel Redis setup.

### Breaking Changes

- **Library Migration:**  
  - The switch from `redis` to `ioredis` may require adjustments in how the library is imported and configured in your project.
- **Configuration Updates:**  
  - New configuration options are introduced, and some defaults have changed. Please review and update your configuration to be compatible with v1.0.0.
